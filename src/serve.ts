/**
 * REST API server for aifunctions. Run with: npm run serve
 * Exposes skill run, optimize, race, content workflows, jobs, and functions lifecycle.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import {
  getSkillsResolver,
  getLibraryIndex,
  updateLibraryIndex,
  buildFullLibrarySnapshot,
  writeFullLibrarySnapshot,
  DEFAULT_FULL_LIBRARY_DOCS_PATH,
  createClient,
  getSkillInstructions,
  setSkillInstructions,
  getSkillRules,
  setSkillRules,
  getSkillTestCases,
  setSkillTestCases,
  getFunctionMeta,
  setFunctionMeta,
  getSkillInstructionVersions,
  getSkillInstructionsAtRef,
  getSkillRulesAtRef,
  setSkillInstructionsActiveVersion,
  setSkillRulesActiveVersion,
  pushSkillsContent,
  appendRace,
  setProfiles,
  setDefaults,
  getProfiles,
  getRaceReport,
  resolveSkillInstructions,
} from "./index.js";
import type { RaceRecord, RaceProfile } from "./content/raceStorage.js";
import {
  run,
  getSkillNames,
  getSkillNamesAsync,
  optimizeInstruction,
  raceModels,
  judge,
  generateJudgeRules,
  optimizeJudgeRules,
  fixInstructions,
  compare,
  generateInstructions,
  executeSkill,
  buildRequestPrompt,
  type JudgeRule,
} from "../functions/index.js";
import { runFixtures } from "./content/runFixtures.js";
import { runLayoutLint } from "./content/lintContentLayout.js";
import { validateFunction } from "./content/validateFunction.js";
import { requireAuth } from "./serve/auth.js";
import { wrapWithUsageTracking, toUsageResponse } from "./serve/usageTracker.js";
import { extractAttribution } from "./serve/attribution.js";
import { getModelOverrides } from "./env.js";
import { getModePreset } from "./core/modePreset.js";
import { lookupCost } from "./serve/pricingTable.js";
import {
  createJob,
  getJob,
  updateJob,
  appendJobLog,
  getJobLogs,
  listJobs,
} from "./serve/jobs.js";
import {
  fetchOpenRouterCredits,
  fetchOpenRouterGenerations,
  fetchOpenRouterModels,
} from "./serve/analyticsOpenRouter.js";
import {
  fetchOpenAIUsage,
  fetchOpenAICosts,
} from "./serve/analyticsOpenAI.js";
import { appendActivity, queryActivity } from "./serve/activityLog.js";
import { getRateLimitKey, consumeRateLimit, rateLimitHeaders, type RateLimitResult } from "./serve/rateLimit.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3780;
const MAX_CONCURRENCY = Math.max(1, Number(process.env.MAX_CONCURRENCY) || 10);
const serverStartedAt = Date.now();
let concurrency = 0;
const concurrencyGuard = <T>(fn: () => Promise<T>): Promise<T> => {
  if (concurrency >= MAX_CONCURRENCY) {
    return Promise.reject({ code: "QUEUE_FULL", status: 503, message: "Server busy; retry later" });
  }
  concurrency++;
  return fn().finally(() => {
    concurrency--;
  });
};

const MAX_BODY_SIZE = 100 * 1024; // 100KB per aifunction.dev free tier

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  const contentLength = req.headers["content-length"];
  if (contentLength !== undefined) {
    const n = parseInt(contentLength, 10);
    if (!Number.isNaN(n) && n > MAX_BODY_SIZE) {
      return Promise.reject(Object.assign(new Error("Request body too large"), { status: 413, code: "PAYLOAD_TOO_LARGE" }));
    }
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > MAX_BODY_SIZE) {
        req.destroy();
        reject(Object.assign(new Error("Request body too large"), { status: 413, code: "PAYLOAD_TOO_LARGE" }));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body.trim()) { resolve(undefined); return; }
      try { resolve(JSON.parse(body)); }
      catch { reject(new Error("Invalid JSON body")); }
    });
    req.on("error", reject);
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-openrouter-key",
  "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
};

function sendOk(res: import("node:http").ServerResponse, data: unknown, extraHeaders?: Record<string, string>) {
  res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders });
  res.end(JSON.stringify({ ok: true, data }));
}

function sendError(res: import("node:http").ServerResponse, status: number, message: string, code: string, extraHeaders?: Record<string, string>) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS, ...extraHeaders });
  res.end(JSON.stringify({ ok: false, error: { code, message } }));
}

function parsePath(pathStr: string): { segments: string[] } {
  const segments = pathStr.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  return { segments };
}

function extractByokKey(req: import("node:http").IncomingMessage): string | undefined {
  const h = req.headers["x-openrouter-key"];
  return (Array.isArray(h) ? h[0] : h)?.trim() || undefined;
}

/** Always returns a usage-tracked client. Uses BYOK key when provided, otherwise falls back to server env key. */
function makeTrackedClient(
  req: import("node:http").IncomingMessage,
  attribution?: import("./core/types.js").AttributionContext
) {
  const byokKey = extractByokKey(req);
  const base = byokKey
    ? createClient({ backend: "openrouter", openrouter: { apiKey: byokKey } })
    : createClient({ backend: "openrouter" });
  return wrapWithUsageTracking(base, attribution);
}

/** Trace payload for options.trace: true (full prompt, model selection, not stored). */
export type RunTrace = {
  mode?: string;
  calls: Array<{ system?: string; user: string; model?: string; modelUsed?: string }>;
};

/** Wrap a client to record each ask() into trace for debugging (trace: true). */
function makeTracingClient(
  client: import("./core/types.js").Client,
  trace: RunTrace,
  mode?: string
): import("./core/types.js").Client {
  trace.mode = mode;
  return {
    ask: async (instruction: string, opts: import("./core/types.js").AskOptions) => {
      const result = await client.ask(instruction, opts);
      trace.calls.push({
        system: opts.system,
        user: instruction,
        model: opts.model,
        modelUsed: result.model ?? undefined,
      });
      return result;
    },
    testConnection: () => client.testConnection(),
    ...(client.askStream && { askStream: client.askStream.bind(client) }),
  };
}

/** Serialize any input value to a string suitable for use as inputMd. */
function toInputMd(val: unknown): string {
  if (typeof val === "string") return val;
  return JSON.stringify(val, null, 2);
}

/** Build synthetic instructions from labeled examples for generateJudgeRules. When providing good/bad examples, include a brief rationale (why) when possible. */
function synthesizeInstructionsFromExamples(
  examples: Array<{ id?: string; input?: unknown; output?: unknown; label?: string; rationale?: string }>,
  context?: string
): string {
  const lines: string[] = [];
  if (context?.trim()) lines.push(`Context: ${context.trim()}\n`);

  const good = examples.filter((e) => e.label === "good");
  const bad = examples.filter((e) => e.label === "bad");

  if (good.length > 0) {
    lines.push("## CORRECT outputs (should PASS all rules)");
    for (const ex of good) {
      if (ex.input != null) lines.push(`Input: ${toInputMd(ex.input)}`);
      if (ex.output != null) lines.push(`Output: ${toInputMd(ex.output)}`);
      if (ex.rationale?.trim()) lines.push(`Why good: ${ex.rationale.trim()}`);
      lines.push("");
    }
  }

  if (bad.length > 0) {
    lines.push("## INCORRECT outputs (should FAIL one or more rules)");
    for (const ex of bad) {
      if (ex.input != null) lines.push(`Input: ${toInputMd(ex.input)}`);
      if (ex.output != null) lines.push(`Output: ${toInputMd(ex.output)}`);
      if (ex.rationale?.trim()) lines.push(`Why bad: ${ex.rationale.trim()}`);
      lines.push("");
    }
  }

  return lines.join("\n").trim();
}

// --- Handlers ---

async function handleRun(
  res: import("node:http").ServerResponse,
  body: unknown,
  skillFromPath?: string,
  req?: import("node:http").IncomingMessage,
  rateLimitResult?: RateLimitResult
): Promise<void> {
  const rlHeaders = rateLimitResult ? rateLimitHeaders(rateLimitResult) : undefined;
  const skill = skillFromPath ?? (body as { skill?: string })?.skill;
  const rawBody = body as { input?: unknown; request?: unknown; options?: { validate?: boolean; trace?: boolean }; mode?: string };
  const request = rawBody?.input ?? rawBody?.request ?? body;
  const validateOption = rawBody?.options?.validate;
  const traceOption = rawBody?.options?.trace === true;
  if (typeof skill !== "string" || !skill.trim()) {
    sendError(res, 400, "function must be a non-empty string", "INVALID_INPUT", rlHeaders);
    return;
  }
  const resolver = getSkillsResolver();
  const validateOutput =
    validateOption === true ||
    process.env.VALIDATE_SKILL_OUTPUT === "1" ||
    process.env.VALIDATE_SKILL_OUTPUT === "true";

  const attribution = req ? extractAttribution(body, skill.trim()) : undefined;
  const requestId = attribution?.traceId ?? randomUUID();
  const tracker = req ? makeTrackedClient(req, attribution) : null;
  let traceCollector: RunTrace | undefined;
  if (traceOption) {
    traceCollector = { calls: [] };
  }
  const client = tracker
    ? (traceOption && traceCollector ? makeTracingClient(tracker.client, traceCollector, (request as { mode?: string })?.mode) : tracker.client)
    : undefined;

  try {
    const out = await concurrencyGuard(() =>
      run(skill.trim(), request ?? {}, { resolver, validateOutput, client })
    );
    const usage = tracker ? toUsageResponse(tracker.getUsage()) : null;
    if (tracker) {
      const u = tracker.getUsage();
      if (u.callCount > 0) {
        appendActivity({
          functionId: skill.trim(),
          model: u.model ?? null,
          projectId: attribution?.projectId,
          traceId: attribution?.traceId,
          tokens: { prompt: u.promptTokens, completion: u.completionTokens, total: u.totalTokens },
          cost: u.estimatedCost ?? null,
          latencyMs: u.latencyMs,
          status: "success",
        });
      }
    }

    let meta: Awaited<ReturnType<typeof getFunctionMeta>> | null = null;
    try {
      meta = await getFunctionMeta(resolver, skill.trim());
    } catch {
      /* function may have no meta */
    }
    const draft = meta?.status === "draft";

    const tracePayload = traceOption && traceCollector && traceCollector.calls.length > 0 ? { trace: traceCollector } : {};
    if (validateOutput && typeof out === "object" && out !== null && "validation" in out) {
      const { result, validation } = out as { result: unknown; validation: { valid: boolean; errors?: string[] } };
      sendOk(res, {
        result,
        validation: { valid: validation.valid, errors: validation.errors ?? [] },
        usage,
        requestId,
        ...(draft && { draft: true }),
        ...tracePayload,
      }, rlHeaders);
    } else {
      sendOk(res, { result: out, usage, requestId, ...(draft && { draft: true }), ...tracePayload }, rlHeaders);
    }
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) {
      sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL", rlHeaders);
      return;
    }
    if (err.status === 413 && err.code === "PAYLOAD_TOO_LARGE") {
      sendError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE", rlHeaders);
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unknown skill") || message.includes("Unknown function")) {
      sendError(res, 404, `Function '${skill.trim()}' not found`, "SKILL_NOT_FOUND", rlHeaders);
    } else if (message.includes("No race profile") || message.includes("Run a race first")) {
      sendError(res, 422, message, "NO_RACE_PROFILE", rlHeaders);
    } else {
      sendError(res, 500, message, "RUN_ERROR", rlHeaders);
    }
  }
}

/** Run a function at a pinned version (git ref). Uses getSkillInstructionsAtRef / getSkillRulesAtRef. */
async function handleRunVersioned(
  res: import("node:http").ServerResponse,
  body: unknown,
  functionId: string,
  version: string,
  req: import("node:http").IncomingMessage,
  rateLimitResult?: RateLimitResult
): Promise<void> {
  const rlHeaders = rateLimitResult ? rateLimitHeaders(rateLimitResult) : undefined;
  const rawBody = body as { input?: unknown; request?: unknown };
  const request = rawBody?.input ?? rawBody?.request ?? body;
  const resolver = getSkillsResolver();
  const attribution = extractAttribution(body, functionId);
  const requestId = attribution?.traceId ?? randomUUID();
  const tracker = makeTrackedClient(req, attribution);
  const client = tracker.client;

  try {
    const instruction = await getSkillInstructionsAtRef(resolver, functionId, version);
    const rules = await getSkillRulesAtRef(resolver, functionId, version);
    const out = await concurrencyGuard(() =>
      executeSkill({
        request: request ?? {},
        buildPrompt: (r) => `# ${functionId}\n\n` + buildRequestPrompt(r),
        instructions: { weak: instruction, normal: instruction, strong: instruction },
        rules,
        client,
        mode: "normal",
      })
    );
    const usage = toUsageResponse(tracker.getUsage());
    if (tracker.getUsage().callCount > 0) {
      appendActivity({
        functionId,
        model: tracker.getUsage().model ?? null,
        projectId: attribution?.projectId,
        traceId: attribution?.traceId,
        tokens: { prompt: tracker.getUsage().promptTokens, completion: tracker.getUsage().completionTokens, total: tracker.getUsage().totalTokens },
        cost: tracker.getUsage().estimatedCost ?? null,
        latencyMs: tracker.getUsage().latencyMs,
        status: "success",
      });
    }
    sendOk(res, { result: out, usage, requestId }, rlHeaders);
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) {
      sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL", rlHeaders);
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unknown skill") || message.includes("Unknown function") || message.includes("not support version")) {
      sendError(res, 422, message, "VERSION_NOT_AVAILABLE", rlHeaders);
    } else {
      sendError(res, 500, message, "RUN_ERROR", rlHeaders);
    }
  }
}

async function handleSkillsList(
  res: import("node:http").ServerResponse,
  query: { tag?: string; category?: string; q?: string }
): Promise<void> {
  try {
    const resolver = getSkillsResolver();
    const names = await getSkillNamesAsync(resolver);
    let index: Awaited<ReturnType<typeof getLibraryIndex>> | null = null;
    try { index = await getLibraryIndex({ resolver, allowMissing: true }); } catch { /* no index */ }
    const byId = new Map<string, { $refKey: string; entry?: Record<string, unknown> }>();
    if (index?.skills) {
      for (const ref of index.skills) {
        const r = ref as { $refKey: string };
        try {
          const raw = await resolver.get(r.$refKey);
          const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown> & { id?: string };
          if (entry.id) byId.set(entry.id as string, { $refKey: r.$refKey, entry });
        } catch { /* skip */ }
      }
    }
    let skills = names.map((name) => {
      const meta = byId.get(name);
      const entry = meta?.entry as { description?: string; category?: string; tags?: string[]; io?: unknown } | undefined;
      return {
        name,
        description: entry?.description ?? "Skill from library index",
        category: entry?.category ?? "general",
        tags: entry?.tags ?? [],
        modes: ["weak", "normal", "strong"],
        version: "1.0.0",
        input: (entry as { io?: { input?: unknown } })?.io?.input ?? { type: "object", properties: {} },
        output: (entry as { io?: { output?: unknown } })?.io?.output ?? { type: "object", properties: {} },
      };
    });
    if (query.tag) skills = skills.filter((s) => s.tags.includes(query.tag!));
    if (query.category) skills = skills.filter((s) => s.category === query.category);
    if (query.q?.trim()) {
      const q = query.q.trim().toLowerCase();
      skills = skills.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        (s.description && String(s.description).toLowerCase().includes(q))
      );
    }
    sendOk(res, { skills });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleSkillDetail(res: import("node:http").ServerResponse, name: string): Promise<void> {
  try {
    const resolver = getSkillsResolver();
    const names = await getSkillNamesAsync(resolver);
    if (!names.includes(name)) {
      sendError(res, 404, `Function '${name}' not found`, "SKILL_NOT_FOUND");
      return;
    }
    let entry: Record<string, unknown> | null = null;
    try {
      const index = await getLibraryIndex({ resolver, allowMissing: true });
      const ref = index.skills?.find((r) => {
        const key = (r as { $refKey?: string }).$refKey;
        return key?.includes(`/${name}/`) || key?.endsWith(`/${name}`);
      }) as { $refKey: string } | undefined;
      if (ref) {
        const raw = await resolver.get(ref.$refKey);
        entry = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown>;
      }
    } catch { /* no index */ }
    const instructions: Record<string, string> = { weak: "Available", strong: "Available", ultra: "Not configured" };
    if (entry) {
      sendOk(res, { ...entry, name: entry.id ?? name, version: (entry as { schemaVersion?: string }).schemaVersion ?? "1.0.0", examples: (entry as { examples?: unknown[] }).examples ?? [], instructions });
    } else {
      sendOk(res, { name, version: "1.0.0", examples: [], instructions });
    }
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleOptimizeInstructions(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = body as { instructions?: string; skillName?: string | null; mode?: "weak" | "strong"; model?: string };
  let rawInstructions = b?.instructions;
  const skillName = typeof b?.skillName === "string" ? b.skillName : "unknown";
  const mode = b?.mode === "weak" ? "weak" : "normal";
  if (!rawInstructions && b?.skillName) {
    const resolver = getSkillsResolver();
    rawInstructions = await getSkillInstructions(resolver, b.skillName);
    if (!rawInstructions?.trim()) {
      sendError(res, 404, `No instructions found for skill: ${b.skillName}`, "SKILL_NOT_FOUND");
      return;
    }
  }
  if (typeof rawInstructions !== "string" || !rawInstructions.trim()) {
    sendError(res, 400, "Provide instructions or skillName", "INVALID_INPUT");
    return;
  }
  try {
    const result = await concurrencyGuard(() =>
      optimizeInstruction(rawInstructions!, mode, skillName, { model: b?.model })
    );
    const before = rawInstructions!.trim();
    const after = result.optimized.trim();
    const diff = before !== after ? `- ${before.split("\n").join("\n- ")}\n+ ${after.split("\n").join("\n+ ")}` : "";
    sendOk(res, {
      optimizedInstructions: result.optimized,
      diff: diff || undefined,
      usage: { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, totalTokens: result.usage.totalTokens },
    });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleOptimizeSkill(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = body as { skillName?: string; mode?: "weak" | "strong"; runValidation?: boolean };
  if (!b?.skillName || typeof b.skillName !== "string") { sendError(res, 400, "skillName is required", "INVALID_INPUT"); return; }
  const resolver = getSkillsResolver();
  const mode = b?.mode === "weak" ? "weak" : "normal";
  try {
    const before = await getSkillInstructions(resolver, b.skillName);
    if (!before?.trim()) { sendError(res, 404, `No instructions for skill: ${b.skillName}`, "SKILL_NOT_FOUND"); return; }
    const result = await concurrencyGuard(() => optimizeInstruction(before, mode, b.skillName!));
    await setSkillInstructions(resolver, b.skillName, result.optimized);
    const validationSummary = b?.runValidation
      ? await runFixtures({ resolver, skillName: b.skillName }).then((r) => ({ ok: r.ok, failed: r.failed }))
      : undefined;
    sendOk(res, { before, after: result.optimized, validationSummary, usage: result.usage });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleOptimizeBatch(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = body as { skills?: string[]; mode?: "weak" | "strong"; continueOnError?: boolean };
  const resolver = getSkillsResolver();
  let skills: string[] = b?.skills ?? [];
  if (skills.length === 0) {
    const all = await getSkillNamesAsync(resolver);
    skills = all.filter((n) => n !== "ai.ask");
  }
  const { id, job } = createJob("batch", { totalSkills: skills.length });
  void job;
  updateJob(id, { status: "running" });
  sendOk(res, { jobId: id, status: "running", totalSkills: skills.length });
  const mode = b?.mode === "weak" ? "weak" : "normal";
  const continueOnError = b?.continueOnError === true;
  const results: Array<{ skillName: string; ok: boolean; error?: string }> = [];
  (async () => {
    try {
      for (let i = 0; i < skills.length; i++) {
        const skillName = skills[i]!;
        updateJob(id, { progress: (i + 1) / skills.length, currentStep: `Optimizing ${skillName}` });
        try {
          const before = await getSkillInstructions(resolver, skillName);
          if (!before?.trim()) { results.push({ skillName, ok: false, error: "No instructions" }); if (!continueOnError) break; continue; }
          const result = await optimizeInstruction(before, mode, skillName);
          await setSkillInstructions(resolver, skillName, result.optimized);
          results.push({ skillName, ok: true });
        } catch (e) {
          results.push({ skillName, ok: false, error: e instanceof Error ? e.message : String(e) });
          if (!continueOnError) break;
        }
      }
      updateJob(id, { status: "completed", progress: 1, result: { results } });
    } catch (e) {
      updateJob(id, { status: "failed", error: e instanceof Error ? e.message : String(e), errorCode: "OPTIMIZE_ERROR" });
    }
  })();
}

async function handleOptimizeJudge(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as {
    instructions?: string;
    input?: unknown;
    response?: string;
    rules?: JudgeRule[];
    threshold?: number;
    mode?: "normal" | "strong";
    model?: string;
  };
  if (typeof b?.instructions !== "string" || !b.instructions.trim()) {
    sendError(res, 400, "instructions is required", "INVALID_INPUT"); return;
  }
  if (typeof b?.response !== "string" || !b.response.trim()) {
    sendError(res, 400, "response is required", "INVALID_INPUT"); return;
  }
  const tracker = makeTrackedClient(req, extractAttribution(body, "optimize.judge"));
  try {
    const result = await concurrencyGuard(() =>
      judge({
        instructions: b.instructions!,
        response: b.response!,
        rules: b.rules ?? [],
        threshold: b.threshold ?? 0.8,
        mode: b.mode === "strong" ? "strong" : "normal",
        model: b.model,
        client: tracker.client,
      })
    );
    sendOk(res, { ...result, usage: toUsageResponse(tracker.getUsage()) });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "JUDGE_ERROR");
  }
}

async function handleOptimizeRules(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as {
    instructions?: string;
    examples?: Array<{ id?: string; input?: unknown; output?: unknown; label?: string; rationale?: string }>;
    context?: string;
    targetRuleCount?: number;
    weightScale?: "1-3" | "1-5" | "1-10";
    includeFormatRules?: boolean;
    model?: string;
  };

  let finalInstructions: string;

  if (Array.isArray(b?.examples) && b.examples.length > 0) {
    // Contract path: derive rules from labeled examples
    const synth = synthesizeInstructionsFromExamples(b.examples, b.context);
    finalInstructions = b.instructions?.trim()
      ? `${synth}\n\nAdditional context:\n${b.instructions.trim()}`
      : synth;
  } else if (typeof b?.instructions === "string" && b.instructions.trim()) {
    // Backwards-compat: rules from instructions directly
    finalInstructions = b.instructions.trim();
  } else {
    sendError(res, 400, "Provide examples (array of {input, output, label}) or instructions", "INVALID_INPUT");
    return;
  }

  const tracker = makeTrackedClient(req, extractAttribution(body, "optimize.rules"));
  try {
    const result = await concurrencyGuard(() =>
      generateJudgeRules({
        instructions: finalInstructions,
        targetRuleCount: b?.targetRuleCount,
        weightScale: b?.weightScale,
        includeFormatRules: b?.includeFormatRules,
        model: b?.model,
        client: tracker.client,
      })
    );
    sendOk(res, { ...result, usage: toUsageResponse(tracker.getUsage()) });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "RULES_ERROR");
  }
}

async function handleOptimizeRulesOptimize(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as {
    existingRules?: JudgeRule[];
    examples?: Array<{ id?: string; input?: string; output?: string; label?: "good" | "bad"; rationale?: string }>;
    ruleMode?: "append" | "replace";
    instructions?: string;
    targetRuleCount?: number;
    weightScale?: "1-3" | "1-5" | "1-10";
    model?: string;
  };
  if (!Array.isArray(b?.existingRules)) b.existingRules = [];
  if (!Array.isArray(b?.examples) || b.examples.length === 0) {
    sendError(res, 400, "examples (with rationale) are required", "INVALID_INPUT");
    return;
  }
  const ruleMode = b.ruleMode ?? "replace";
  const examples = b.examples.map((e) => ({
    id: e.id,
    input: e.input,
    output: e.output,
    label: (e.label === "good" || e.label === "bad" ? e.label : "good") as "good" | "bad",
    rationale: e.rationale ?? "",
  }));
  const tracker = makeTrackedClient(req, extractAttribution(body, "optimize.rules-optimize"));
  try {
    const result = await concurrencyGuard(() =>
      optimizeJudgeRules({
        existingRules: b.existingRules!,
        examples,
        ruleMode,
        instructions: b.instructions,
        targetRuleCount: b?.targetRuleCount,
        weightScale: b?.weightScale,
        model: b?.model,
        client: tracker.client,
      })
    );
    sendOk(res, { ...result, usage: toUsageResponse(tracker.getUsage()) });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "RULES_OPTIMIZE_ERROR");
  }
}

async function handleOptimizeFix(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as { instructions?: string; judgeFeedback?: object; model?: string };
  if (typeof b?.instructions !== "string" || !b.instructions.trim()) {
    sendError(res, 400, "instructions is required", "INVALID_INPUT"); return;
  }
  if (!b?.judgeFeedback || typeof b.judgeFeedback !== "object") {
    sendError(res, 400, "judgeFeedback is required", "INVALID_INPUT"); return;
  }
  const tracker = makeTrackedClient(req, extractAttribution(body, "optimize.fix"));
  try {
    const result = await concurrencyGuard(() =>
      fixInstructions({ instructions: b.instructions!, judgeFeedback: b.judgeFeedback!, model: b.model, client: tracker.client })
    );
    sendOk(res, { ...result, usage: toUsageResponse(tracker.getUsage()) });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "FIX_ERROR");
  }
}

async function handleOptimizeCompare(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as {
    instructions?: string;
    responses?: Array<{ id: string; text: string }>;
    rules?: JudgeRule[];
    threshold?: number;
    mode?: "normal" | "strong";
    model?: string;
  };
  if (typeof b?.instructions !== "string" || !b.instructions.trim()) {
    sendError(res, 400, "instructions is required", "INVALID_INPUT"); return;
  }
  if (!Array.isArray(b?.responses) || b.responses.length < 2) {
    sendError(res, 400, "responses must be an array of at least 2 items", "INVALID_INPUT"); return;
  }
  const tracker = makeTrackedClient(req, extractAttribution(body, "optimize.compare"));
  try {
    const result = await concurrencyGuard(() =>
      compare({ instructions: b.instructions!, responses: b.responses!, rules: b.rules, threshold: b.threshold ?? 0.8, mode: b.mode, model: b.model, client: tracker.client })
    );
    sendOk(res, { ...result, usage: toUsageResponse(tracker.getUsage()) });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "COMPARE_ERROR");
  }
}

async function handleOptimizeGenerate(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as {
    // Contract fields
    description?: string;
    testCases?: Array<{ id: string; input?: unknown; inputMd?: string }>;
    rules?: JudgeRule[];
    threshold?: number;
    maxCycles?: number;
    mode?: string;
    targetModel?: string | { model: string; class?: "weak" | "normal" | "strong" };
    // Legacy / pass-through fields
    seedInstructions?: string;
    judgeThreshold?: number;
    targetAverageThreshold?: number;
    loop?: { maxCycles: number; forceContinueAfterPass?: boolean; patienceCycles?: number };
    judgeRules?: JudgeRule[];
  };

  // Resolve seed instructions: prefer explicit seedInstructions, fall back to description
  const seedInstructions = b?.seedInstructions?.trim() || b?.description?.trim();
  if (!seedInstructions) {
    sendError(res, 400, "description (or seedInstructions) is required", "INVALID_INPUT"); return;
  }
  if (!Array.isArray(b?.testCases) || b.testCases.length === 0) {
    sendError(res, 400, "testCases must be a non-empty array", "INVALID_INPUT"); return;
  }

  // Normalise test cases: accept {input} or {inputMd}
  const normalisedTestCases = b.testCases.map((tc) => ({
    id: tc.id,
    inputMd: tc.inputMd ?? toInputMd(tc.input),
  }));

  // Normalise targetModel
  let targetModel: { model: string; class: "weak" | "normal" | "strong" };
  if (typeof b?.targetModel === "string") {
    targetModel = { model: b.targetModel, class: "normal" };
  } else if (b?.targetModel && typeof b.targetModel === "object") {
    targetModel = { model: b.targetModel.model, class: b.targetModel.class ?? "normal" };
  } else {
    const envOverrides = getModelOverrides();
    const normalModel = envOverrides.normal ?? getModePreset("normal").model;
    targetModel = { model: normalModel!, class: "normal" };
  }

  // Normalise thresholds and loop
  const judgeThreshold = b?.judgeThreshold ?? b?.threshold ?? 0.8;
  const targetAverageThreshold = b?.targetAverageThreshold ?? b?.threshold ?? 0.85;
  const loop = b?.loop ?? { maxCycles: b?.maxCycles ?? 5 };
  const judgeRules = b?.judgeRules ?? b?.rules;

  const tracker = makeTrackedClient(req, extractAttribution(body, "optimize.generate"));
  const { id } = createJob("generate-instructions", { preview: seedInstructions.slice(0, 80) } as never);
  updateJob(id, { status: "running" });
  sendOk(res, { jobId: id, status: "running" });

  (async () => {
    try {
      const result = await generateInstructions({
        seedInstructions,
        testCases: normalisedTestCases,
        call: "ask",
        targetModel,
        judgeRules,
        judgeThreshold,
        targetAverageThreshold,
        loop,
        optimizer: { mode: "strong" },
        client: tracker.client,
      });
      const usage = toUsageResponse(tracker.getUsage());
      updateJob(id, { status: "completed", progress: 1, result: { ...result, usage } });
    } catch (e) {
      updateJob(id, { status: "failed", error: e instanceof Error ? e.message : String(e), errorCode: "GENERATE_ERROR" });
    }
  })();
}

async function handleRaceModels(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  if (body == null || typeof body !== "object") { sendError(res, 400, "Body must be RaceModelsRequest object", "INVALID_INPUT"); return; }
  const b = body as {
    type?: "model" | "temperature" | "tokens";
    taskName?: string;
    call?: "ask" | "askJson";
    skill?: { strongSystem: string; weakSystem?: string };
    testCases?: Array<{ id: string; inputMd?: string; input?: unknown }>;
    judgeRules?: JudgeRule[];
    threshold?: number;
    models?: Array<{ id: string; model: string; vendor?: string | string[]; class: "weak" | "normal" | "strong"; options?: { maxTokens?: number; temperature?: number; timeoutMs?: number } }>;
    model?: string;
    temperatures?: number[];
    tokenValues?: number[];
    temperature?: number;
    functionKey?: string;
    applyDefaults?: boolean;
    raceLabel?: string;
    notes?: string;
  };
  let request = body as Parameters<typeof raceModels>[0];
  let raceType: "model" | "temperature" | "tokens" = "model";
  if (b.type === "temperature" && typeof b.model === "string" && Array.isArray(b.temperatures) && b.temperatures.length > 0) {
    raceType = "temperature";
    const testCases = (b.testCases ?? []).map((tc) => ({ id: tc.id, inputMd: (tc as { inputMd?: string }).inputMd ?? toInputMd((tc as { input?: unknown }).input) }));
    if (!testCases.length && b.functionKey) {
      sendError(res, 400, "testCases required for temperature race", "INVALID_INPUT");
      return;
    }
    const models = b.temperatures.map((t, i) => ({
      id: `temp-${t}`,
      model: b.model!,
      class: "normal" as const,
      options: { temperature: t, maxTokens: b.judgeRules ? undefined : 2048 },
    }));
    const skillSystem = b.skill?.strongSystem ?? (b.functionKey ? "" : "Follow the user request.");
    request = {
      taskName: b.taskName ?? "temperature-race",
      call: b.call ?? "ask",
      skill: { strongSystem: skillSystem || "Follow the user request." },
      testCases: testCases.length ? testCases : [{ id: "cal", inputMd: "Calibrate." }],
      judgeRules: b.judgeRules,
      threshold: b.threshold ?? 0.8,
      models,
      client: (body as { client?: unknown }).client,
    } as Parameters<typeof raceModels>[0];
    if (b.functionKey?.trim() && !request.skill.strongSystem) {
      const resolver = getSkillsResolver();
      request.skill.strongSystem = await getSkillInstructions(resolver, b.functionKey.trim()) || "Follow the user request.";
      (request as { judgeRules?: JudgeRule[] }).judgeRules = await getSkillRules(resolver, b.functionKey.trim());
    }
  }
  if (b.type === "tokens" && typeof b.model === "string" && Array.isArray(b.tokenValues) && b.tokenValues.length > 0) {
    raceType = "tokens";
    const testCases = (b.testCases ?? []).map((tc) => ({ id: tc.id, inputMd: (tc as { inputMd?: string }).inputMd ?? toInputMd((tc as { input?: unknown }).input) }));
    if (!testCases.length && b.functionKey) {
      sendError(res, 400, "testCases required for tokens race", "INVALID_INPUT");
      return;
    }
    const models = b.tokenValues.map((maxTok) => ({
      id: `tokens-${maxTok}`,
      model: b.model!,
      class: "normal" as const,
      options: { maxTokens: maxTok, temperature: b.temperature ?? 0.3 },
    }));
    const skillSystem = b.skill?.strongSystem ?? (b.functionKey ? "" : "Follow the user request.");
    request = {
      taskName: b.taskName ?? "tokens-race",
      call: b.call ?? "ask",
      skill: { strongSystem: skillSystem || "Follow the user request." },
      testCases: testCases.length ? testCases : [{ id: "cal", inputMd: "Calibrate." }],
      judgeRules: b.judgeRules,
      threshold: b.threshold ?? 0.8,
      models,
      client: (body as { client?: unknown }).client,
    } as Parameters<typeof raceModels>[0];
    if (b.functionKey?.trim() && !request.skill.strongSystem) {
      const resolver = getSkillsResolver();
      request.skill.strongSystem = await getSkillInstructions(resolver, b.functionKey.trim()) || "Follow the user request.";
      (request as { judgeRules?: JudgeRule[] }).judgeRules = await getSkillRules(resolver, b.functionKey.trim());
    }
  }
  if (b.functionKey?.trim() && (!b.skill?.strongSystem || !b.testCases?.length) && Array.isArray(b.models) && b.models.length > 0 && raceType === "model") {
    const resolver = getSkillsResolver();
    const instructions = await getSkillInstructions(resolver, b.functionKey.trim());
    const rules = await getSkillRules(resolver, b.functionKey.trim());
    const testCases = (b.testCases ?? []).map((tc) => ({ id: tc.id, inputMd: (tc as { inputMd?: string }).inputMd ?? toInputMd((tc as { input?: unknown }).input) }));
    if (!testCases.length) { sendError(res, 400, "testCases required when using functionKey", "INVALID_INPUT"); return; }
    request = {
      taskName: b.taskName ?? b.functionKey,
      call: b.call ?? "ask",
      skill: { strongSystem: instructions || "Follow the user request." },
      testCases,
      judgeRules: rules?.length ? rules : undefined,
      threshold: b.threshold ?? 0.8,
      models: b.models,
      client: (body as { client?: unknown }).client,
    } as Parameters<typeof raceModels>[0];
  }
  const totalRuns = (request.testCases?.length ?? 1) * (request.models?.length ?? 1);
  const { id } = createJob("race", { totalRuns });
  updateJob(id, { status: "running" });
  sendOk(res, { jobId: id, status: "running", totalRuns });
  const functionKey = b.functionKey?.trim();
  const applyDefaults = b.applyDefaults !== false;
  const raceLabel = b.raceLabel;
  const notes = b.notes;
  (async () => {
    try {
      const result = await concurrencyGuard(() => raceModels(request));
      if (functionKey && result && typeof result === "object" && "ranking" in result && "bestModelId" in result) {
        const resolver = getSkillsResolver();
        const ranking = (result as { ranking: Array<{ modelId: string; avgScoreNormalized: number; passRate: number; avgLostPoints: number }> }).ranking;
        const details = (result as { details: Array<{ modelId: string; perTest: Array<{ judge: { scoreNormalized: number; lostPoints: number } }> }> }).details;
        const attempts = details.map((d) => {
          const n = d.perTest?.length ?? 0;
          const perTest = d.perTest as Array<{ judge: { scoreNormalized: number; lostPoints: number; pass?: boolean } }>;
          const candidate = request.models?.find((m: { id: string }) => m.id === d.modelId) as { id: string; model: string; options?: { maxTokens?: number; temperature?: number } } | undefined;
          // costSnapshot: use pricing rate proxy (1000 prompt + 500 completion) as relative cost indicator.
          // Actual per-model tokens are not tracked at the race level; this is a ranking proxy only.
          const costSnapshot = candidate ? lookupCost(candidate.model, 1000, 500) : null;
          return {
            modelId: d.modelId,
            avgScoreNormalized: n > 0 ? perTest.reduce((s, t) => s + t.judge.scoreNormalized, 0) / n : 0,
            passRate: n > 0 ? perTest.filter((t) => t.judge.pass).length / n : 0,
            avgLostPoints: n > 0 ? perTest.reduce((s, t) => s + t.judge.lostPoints, 0) / n : 0,
            costSnapshot,
          };
        });
        const bestModelId = (result as { bestModelId: string }).bestModelId;
        const bestCandidate = request.models?.find((m: { id: string }) => m.id === bestModelId) as { id: string; model: string; options?: { maxTokens?: number; temperature?: number } } | undefined;
        // cheapest: attempt with the lowest costSnapshot (proxy for price per token); fallback to best.
        const attemptsWithCost = attempts.filter((a) => a.costSnapshot != null);
        const cheapestAttempt = attemptsWithCost.length > 0
          ? attemptsWithCost.reduce((min, a) => (a.costSnapshot! < min.costSnapshot! ? a : min))
          : null;
        const cheapestModelId = cheapestAttempt?.modelId ?? bestModelId;
        const cheapestCandidate = request.models?.find((m: { id: string }) => m.id === cheapestModelId) as { id: string; model: string; options?: { maxTokens?: number; temperature?: number } } | undefined;
        const raceId = `${new Date().toISOString().replace(/[:.]/g, "-")}#${id}`;
        const record: RaceRecord = {
          raceId,
          type: raceType,
          label: raceLabel,
          notes,
          applyDefaults,
          candidates: { models: request.models },
          attempts: attempts as RaceRecord["attempts"],
          winners: { best: bestModelId, cheapest: cheapestModelId, fastest: bestModelId, balanced: bestModelId },
          runAt: new Date().toISOString(),
          summary: (result as { summary?: string }).summary,
        };
        await appendRace(resolver, functionKey, record);
        if (applyDefaults && bestCandidate) {
          const bestProfile: RaceProfile = {
            model: bestCandidate.model,
            temperature: bestCandidate.options?.temperature,
            maxTokens: bestCandidate.options?.maxTokens,
          };
          const cheapestProfile: RaceProfile = cheapestCandidate
            ? { model: cheapestCandidate.model, temperature: cheapestCandidate.options?.temperature, maxTokens: cheapestCandidate.options?.maxTokens }
            : bestProfile;
          await setProfiles(resolver, functionKey, { best: bestProfile, cheapest: cheapestProfile, fastest: bestProfile, balanced: bestProfile });
        }
        if (applyDefaults && raceType === "temperature" && b.temperatures?.length === 1) {
          const defaultMaxTokens = bestCandidate?.options?.maxTokens ?? 2048;
          await setDefaults(resolver, functionKey, { maxTokens: defaultMaxTokens });
        }
      }
      updateJob(id, { status: "completed", progress: 1, result });
    } catch (e) {
      updateJob(id, { status: "failed", error: e instanceof Error ? e.message : String(e), errorCode: "OPENROUTER_HTTP_ERROR" });
    }
  })();
}

// --- Functions lifecycle handlers ---

async function handleGetFunctionProfiles(res: import("node:http").ServerResponse, functionId: string): Promise<void> {
  const resolver = getSkillsResolver();
  const names = await getSkillNamesAsync(resolver);
  if (!names.includes(functionId)) { sendError(res, 404, `Function '${functionId}' not found`, "FUNCTION_NOT_FOUND"); return; }
  try {
    const { defaults, profiles } = await getProfiles(resolver, functionId);
    sendOk(res, { defaults: defaults ?? null, profiles: profiles ?? null });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "PROFILES_ERROR");
  }
}

async function handleGetFunctionRaceReport(
  res: import("node:http").ServerResponse,
  functionId: string,
  query: Record<string, string | undefined>
): Promise<void> {
  const resolver = getSkillsResolver();
  const names = await getSkillNamesAsync(resolver);
  if (!names.includes(functionId)) { sendError(res, 404, `Function '${functionId}' not found`, "FUNCTION_NOT_FOUND"); return; }
  try {
    const last = query.last != null ? parseInt(String(query.last), 10) : undefined;
    const since = query.since;
    const raceId = query.raceId;
    const races = await getRaceReport(resolver, functionId, { last: Number.isFinite(last) ? last : undefined, since, raceId });
    sendOk(res, { races });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "RACE_REPORT_ERROR");
  }
}

async function handleCreateFunction(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = body as {
    id?: string;
    description?: string;
    seedInstructions?: string;
    instructions?: string;
    inputSchema?: unknown;
    outputSchema?: unknown;
    rules?: JudgeRule[];
    scoreGate?: number;
    modelPolicy?: string;
    examples?: unknown[];
  };
  if (typeof b?.id !== "string" || !b.id.trim()) { sendError(res, 400, "id is required", "INVALID_INPUT"); return; }
  const instructions = b.seedInstructions?.trim() || b.instructions?.trim();
  if (!instructions) { sendError(res, 400, "seedInstructions (or instructions) is required", "INVALID_INPUT"); return; }
  const cleanId = b.id.trim();
  const resolver = getSkillsResolver();
  try {
    await setSkillInstructions(resolver, cleanId, instructions);
    if (b.rules?.length) await setSkillRules(resolver, cleanId, b.rules);
    const meta = await getFunctionMeta(resolver, cleanId);
    await setFunctionMeta(resolver, cleanId, {
      ...meta,
      status: "draft",
      scoreGate: typeof b.scoreGate === "number" ? b.scoreGate : meta.scoreGate,
    });
    sendOk(res, {
      id: cleanId,
      status: "draft",
      version: null,
      endpoint: `/functions/${cleanId}/run`,
      scoreGate: typeof b.scoreGate === "number" ? b.scoreGate : meta.scoreGate,
      modelPolicy: b.modelPolicy ?? "auto",
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "CREATE_ERROR");
  }
}

const MODE_DESCRIPTIONS: Record<string, string> = {
  weak: "Local or cheap",
  normal: "Mid-tier",
  strong: "High-quality cloud",
  ultra: "Best available",
};

async function handleActivity(
  res: import("node:http").ServerResponse,
  query: Record<string, string | undefined>
): Promise<void> {
  const from = query.from;
  const to = query.to;
  const functionId = query.functionId;
  const projectId = query.projectId;
  const model = query.model;
  const limit = query.limit ? Math.min(1000, Math.max(1, Number(query.limit))) : 100;
  const { activities, summary } = queryActivity({
    from,
    to,
    functionId,
    projectId,
    model,
    limit,
  });
  sendOk(res, { activities, summary });
}

async function handleConfigModes(res: import("node:http").ServerResponse): Promise<void> {
  const overrides = getModelOverrides();
  const modes = ["weak", "normal", "strong", "ultra"] as const;
  const data: Record<string, { model: string; description: string }> = {};
  for (const mode of modes) {
    const preset = getModePreset(mode);
    let model: string;
    if (preset.backend === "llama-cpp") {
      model = "local";
    } else {
      const modeForModel = mode === "weak" || mode === "normal" ? "normal" : "strong";
      model = overrides[modeForModel] ?? preset.model ?? "openrouter/default";
    }
    data[mode] = { model, description: MODE_DESCRIPTIONS[mode] ?? mode };
  }
  sendOk(res, data);
}

async function handleGetFunction(res: import("node:http").ServerResponse, name: string): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const allNames = await getSkillNamesAsync(resolver);
    if (!allNames.includes(name)) { sendError(res, 404, `Function '${name}' not found`, "FUNCTION_NOT_FOUND"); return; }
    const instructions = await getSkillInstructions(resolver, name);
    const meta = await getFunctionMeta(resolver, name);
    const [weakInst, strongInst, ultraInst] = await Promise.all([
      resolveSkillInstructions(resolver, name, "weak").catch(() => ""),
      resolveSkillInstructions(resolver, name, "strong").catch(() => ""),
      resolveSkillInstructions(resolver, name, "ultra").catch(() => ""),
    ]);
    const currentRules = await getSkillRules(resolver, name);
    sendOk(res, {
      id: name,
      instructions,
      status: meta.status,
      version: meta.version,
      releasedAt: meta.releasedAt,
      lastValidation: meta.lastValidation,
      scoreGate: meta.scoreGate,
      currentInstructions: { weak: weakInst, strong: strongInst, ultra: ultraInst },
      currentRules,
      currentRulesCount: currentRules.length,
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "GET_FUNCTION_ERROR");
  }
}

/** Extract JSON array from model response; handles optional markdown code fence. */
function parseGenerateExamplesResponse(text: string): Array<{ input?: unknown; goodOutput?: unknown; goodRationale?: string; badOutput?: unknown; badRationale?: string }> {
  let raw = text.trim();
  const codeMatch = raw.match(/^```(?:json)?\s*([\s\S]*?)```$/m);
  if (codeMatch) raw = codeMatch[1]!.trim();
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
}

async function handleGenerateExamples(
  res: import("node:http").ServerResponse,
  body: unknown,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const b = body as { description?: string; count?: number; mode?: "weak" | "normal" | "strong" | "ultra" };
  if (typeof b?.description !== "string" || !b.description.trim()) {
    sendError(res, 400, "description is required", "INVALID_INPUT");
    return;
  }
  const count = Math.min(10, Math.max(1, Number(b?.count) || 5));
  const mode = b?.mode ?? "strong";
  const prompt = `You are helping create training examples for an AI function. Given this description, generate exactly ${count} diverse examples. Each example must have:
- input: an object (e.g. { "text": "..." } or similar) representing one input case
- goodOutput: the correct/ideal output for that input
- goodRationale: one sentence why this output is correct
- badOutput: an incorrect or suboptimal output for the same input
- badRationale: one sentence why this output is wrong or worse

Description: ${b.description.trim()}

Return a JSON array of ${count} objects, each with keys: input, goodOutput, goodRationale, badOutput, badRationale. No other commentary.`;
  const attribution = extractAttribution(body, "generate-examples");
  const tracker = makeTrackedClient(req, attribution);
  try {
    const preset = getModePreset(mode);
    const overrides = getModelOverrides();
    const modeForModel = mode === "weak" || mode === "normal" ? "normal" : "strong";
    const model = overrides[modeForModel] ?? preset.model;
    if (!model || preset.backend === "llama-cpp") {
      sendError(res, 422, "generate-examples requires OpenRouter (set mode to normal/strong/ultra or set LLM_MODEL_STRONG)", "UNSUPPORTED_MODE");
      return;
    }
    const result = await concurrencyGuard(() =>
      tracker.client.ask(prompt, {
        model,
        temperature: 0.3,
        maxTokens: 4096,
      })
    );
    const examples = parseGenerateExamplesResponse(result.text);
    const usage = toUsageResponse(tracker.getUsage());
    sendOk(res, { examples, usage });
  } catch (e) {
    if (e instanceof SyntaxError) {
      sendError(res, 502, "Model response was not valid JSON", "INVALID_RESPONSE");
      return;
    }
    const err = e as { code?: string; status?: number };
    if (err.code === "QUEUE_FULL" && err.status === 503) {
      sendError(res, 503, "Server busy; retry later", "QUEUE_FULL");
      return;
    }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "GENERATE_EXAMPLES_ERROR");
  }
}

async function handleSaveOptimization(
  res: import("node:http").ServerResponse,
  body: unknown,
  id: string
): Promise<void> {
  const b = body as {
    instructions?: string;
    rules?: Array<{ rule: string; weight: number }>;
    examples?: Array<{ id?: string; input?: unknown; output?: unknown; label?: string; rationale?: string }>;
  };
  const hasInstructions = typeof b?.instructions === "string";
  const hasRules = Array.isArray(b?.rules) && b.rules.length > 0;
  const hasExamples = Array.isArray(b?.examples) && b.examples.length > 0;
  if (!hasInstructions && !hasRules && !hasExamples) {
    sendError(res, 400, "At least one of instructions, rules, or examples is required", "INVALID_INPUT");
    return;
  }
  const resolver = getSkillsResolver();
  const names = await getSkillNamesAsync(resolver);
  if (!names.includes(id)) {
    sendError(res, 404, `Function '${id}' not found`, "FUNCTION_NOT_FOUND");
    return;
  }
  try {
    let instructionsLength: number | undefined;
    let rulesCount: number | undefined;
    let examplesCount: number | undefined;
    if (hasInstructions) {
      await setSkillInstructions(resolver, id, b.instructions!);
      instructionsLength = b.instructions!.length;
    }
    if (hasRules) {
      await setSkillRules(resolver, id, b.rules!);
      rulesCount = b.rules!.length;
    }
    if (hasExamples) {
      const testCases = b.examples!.map((ex, i) => ({
        id: typeof ex.id === "string" ? ex.id : `ex-${i + 1}`,
        inputMd: typeof ex.input === "string" ? ex.input : JSON.stringify(ex.input ?? {}, null, 2),
        expectedOutputMd:
          ex.output != null
            ? typeof ex.output === "string"
              ? ex.output
              : JSON.stringify(ex.output, null, 2)
            : undefined,
      }));
      await setSkillTestCases(resolver, id, testCases);
      examplesCount = testCases.length;
    }
    sendOk(res, {
      saved: true,
      ...(instructionsLength !== undefined && { instructionsLength }),
      ...(rulesCount !== undefined && { rulesCount }),
      ...(examplesCount !== undefined && { examplesCount }),
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "SAVE_OPTIMIZATION_ERROR");
  }
}

async function handleGetFunctionTestCases(res: import("node:http").ServerResponse, name: string): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const raw = await getSkillTestCases(resolver, name);
    // Expose in contract shape: {id, input, expectedOutput}
    const testCases = raw.map((tc) => ({
      id: tc.id,
      input: tc.inputMd,
      expectedOutput: tc.expectedOutputMd ?? undefined,
    }));
    sendOk(res, { testCases });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "TEST_CASES_ERROR");
  }
}

async function handlePutFunctionTestCases(
  res: import("node:http").ServerResponse,
  body: unknown,
  name: string
): Promise<void> {
  const b = body as {
    testCases?: Array<{
      id: string;
      // Contract shape: input is object or string
      input?: unknown;
      expectedOutput?: unknown;
      // Legacy shape: inputMd / expectedOutputMd
      inputMd?: string;
      expectedOutputMd?: string;
    }>;
  };
  if (!Array.isArray(b?.testCases)) { sendError(res, 400, "testCases must be an array", "INVALID_INPUT"); return; }
  const resolver = getSkillsResolver();
  try {
    const stored = b.testCases.map((tc) => ({
      id: tc.id,
      inputMd: tc.inputMd ?? toInputMd(tc.input),
      expectedOutputMd: tc.expectedOutputMd ?? (tc.expectedOutput != null ? toInputMd(tc.expectedOutput) : undefined),
    }));
    await setSkillTestCases(resolver, name, stored);
    sendOk(res, { count: stored.length });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "TEST_CASES_ERROR");
  }
}

async function handleValidateFunction(
  res: import("node:http").ServerResponse,
  name: string,
  req: import("node:http").IncomingMessage
): Promise<void> {
  const resolver = getSkillsResolver();
  const tracker = makeTrackedClient(req, extractAttribution(undefined, `functions.validate:${name}`));
  try {
    const result = await concurrencyGuard(() => validateFunction(resolver, name, { client: tracker.client }));
    sendOk(res, { ...result, usage: toUsageResponse(tracker.getUsage()) });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "VALIDATE_ERROR");
  }
}

async function handleRollbackFunction(res: import("node:http").ServerResponse, name: string, body: unknown): Promise<void> {
  const b = body as { version?: string };
  const ref = typeof b?.version === "string" ? b.version.trim() : "";
  if (!ref) {
    sendError(res, 400, "version (git ref) is required", "INVALID_INPUT");
    return;
  }
  const resolver = getSkillsResolver();
  try {
    const names = await getSkillNamesAsync(resolver);
    if (!names.includes(name)) {
      sendError(res, 404, `Function '${name}' not found`, "FUNCTION_NOT_FOUND");
      return;
    }
    await setSkillInstructionsActiveVersion(resolver, name, ref);
    await setSkillRulesActiveVersion(resolver, name, ref);
    sendOk(res, { rolledBack: true, version: ref });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("does not support version") || message.includes("not found")) {
      sendError(res, 422, message, "ROLLBACK_NOT_AVAILABLE");
    } else {
      sendError(res, 500, message, "ROLLBACK_ERROR");
    }
  }
}

async function handleReleaseFunction(res: import("node:http").ServerResponse, name: string): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const meta = await getFunctionMeta(resolver, name);
    if (!meta.lastValidation) {
      sendError(res, 422, "Function must be validated before release. Call POST /functions/:id:validate first.", "NOT_VALIDATED"); return;
    }
    if (!meta.lastValidation.passed) {
      sendError(res, 422, `Validation score ${meta.lastValidation.score.toFixed(2)} is below gate ${meta.scoreGate}. Improve the function and re-validate before releasing.`, "SCORE_BELOW_GATE"); return;
    }
    const version = `v${new Date().toISOString().slice(0, 10)}.${Date.now()}`;
    const releasedAt = new Date().toISOString();
    await setFunctionMeta(resolver, name, { ...meta, status: "released", version, releasedAt });
    sendOk(res, { version, score: meta.lastValidation.score, releasedAt, endpoint: `/functions/${name}/versions/${version}/run` });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "RELEASE_ERROR");
  }
}

async function handleFunctionVersions(res: import("node:http").ServerResponse, name: string): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const versions = await getSkillInstructionVersions(resolver, name);
    sendOk(res, { versions });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("does not support version APIs")) {
      sendOk(res, { versions: [], note: "Version history requires a Git-backed resolver." }); return;
    }
    sendError(res, 500, message, "VERSIONS_ERROR");
  }
}

async function handleFunctionOptimize(
  res: import("node:http").ServerResponse,
  body: unknown,
  name: string
): Promise<void> {
  const b = body as { mode?: "weak" | "strong"; runValidation?: boolean };
  const resolver = getSkillsResolver();
  const mode = b?.mode === "weak" ? "weak" : "normal";
  try {
    const before = await getSkillInstructions(resolver, name);
    if (!before?.trim()) { sendError(res, 404, `No instructions for function: ${name}`, "FUNCTION_NOT_FOUND"); return; }
    const result = await concurrencyGuard(() => optimizeInstruction(before, mode, name));
    await setSkillInstructions(resolver, name, result.optimized);
    const validationSummary = b?.runValidation
      ? await runFixtures({ resolver, skillName: name }).then((r) => ({ ok: r.ok, failed: r.failed }))
      : undefined;
    sendOk(res, { before, after: result.optimized, validationSummary, usage: result.usage });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) { sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL"); return; }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "OPTIMIZE_ERROR");
  }
}

async function handleFunctionPush(res: import("node:http").ServerResponse, name: string): Promise<void> {
  try {
    const localPath = process.env.SKILLS_LOCAL_PATH;
    if (!localPath) { sendError(res, 422, "SKILLS_LOCAL_PATH env var is required to push content to the remote git repo.", "PUSH_NOT_CONFIGURED"); return; }
    await pushSkillsContent({ localPath, message: `release: ${name}` });
    sendOk(res, { id: name, pushed: true });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "PUSH_ERROR");
  }
}

async function handleContentSync(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { dryRun?: boolean; optimize?: boolean }) ?? {};
  if (b.optimize) {
    const { id } = createJob("content-sync");
    updateJob(id, { status: "running" });
    const args = ["run", "content:sync:no-test", "--", "--no-push", "--optimize"];
    if (b.dryRun) args.push("--dry-run");
    const child = spawn("npm", args, { cwd: rootDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env } });
    child.stdout?.on("data", (chunk) => appendJobLog(id, chunk.toString()));
    child.stderr?.on("data", (chunk) => appendJobLog(id, chunk.toString()));
    child.on("close", (code) => {
      updateJob(id, { status: code === 0 ? "completed" : "failed", result: code === 0 ? { ok: true } : undefined, error: code !== 0 ? `Exit code ${code}` : undefined, errorCode: code !== 0 ? "MISSING_OPTIONAL_DEP" : undefined });
    });
    sendOk(res, { jobId: id, status: "running" }); return;
  }
  try {
    const resolver = getSkillsResolver();
    const report = await updateLibraryIndex({ resolver, prefix: "skills/", dryRun: b.dryRun ?? false });
    const st = report.stats;
    sendOk(res, { synced: (st?.skillsUpdated ?? 0) + (st?.skillsUnchanged ?? 0), created: 0, updated: st?.skillsUpdated ?? 0, unchanged: st?.skillsUnchanged ?? 0, errors: report.errors?.map((e: { reason?: string }) => e.reason ?? String(e)) ?? [] });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentIndex(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { prefix?: string }) ?? {};
  const resolver = getSkillsResolver();
  try {
    const report = await updateLibraryIndex({ resolver, prefix: b.prefix ?? "skills/", dryRun: false });
    const skills: string[] = (report.refKeys ?? []).map((key: string) => { const m = key.match(/[^/]+\.json$/); return m ? m[0].replace(".json", "") : key; });
    sendOk(res, { indexed: report.stats?.skillsTotal ?? 0, skills, errors: report.errors?.map((e: { reason?: string }) => e.reason ?? String(e)) ?? [] });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentIndexFull(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as {
    prefix?: string;
    mode?: "weak" | "normal" | "strong";
    model?: string;
    staticOnly?: boolean;
    writeDocsFallback?: boolean;
  }) ?? {};
  const resolver = getSkillsResolver();
  try {
    const report = await updateLibraryIndex({
      resolver,
      prefix: b.prefix ?? "skills/",
      mode: b.mode ?? "normal",
      model: b.model,
      dryRun: false,
      staticOnly: b.staticOnly ?? false,
    });
    const fullSnapshot = await buildFullLibrarySnapshot({ resolver });
    let docsFallback: { written: boolean; path?: string } = { written: false };
    if (b.writeDocsFallback !== false) {
      const outPath = path.join(rootDir, DEFAULT_FULL_LIBRARY_DOCS_PATH);
      await writeFullLibrarySnapshot(fullSnapshot, outPath);
      docsFallback = { written: true, path: DEFAULT_FULL_LIBRARY_DOCS_PATH };
    }
    const skills: string[] = (report.refKeys ?? []).map((key: string) => {
      const m = key.match(/[^/]+\.json$/);
      return m ? m[0].replace(".json", "") : key;
    });
    sendOk(res, {
      indexed: report.stats?.skillsTotal ?? 0,
      skills,
      errors: report.errors?.map((e: { reason?: string }) => e.reason ?? String(e)) ?? [],
      fullSnapshot,
      docsFallback,
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentFixtures(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { skillName?: string }) ?? {};
  const resolver = getSkillsResolver();
  try {
    const report = await runFixtures({ resolver, skillName: b.skillName });
    const bySkill = new Map<string, { status: "passed" | "failed"; errors: string[] }>();
    for (const r of report.results) {
      const existing = bySkill.get(r.skillId);
      const errs = (r.errors ?? []) as string[];
      if (existing) { if (!r.valid) { existing.status = "failed"; existing.errors.push(...errs); } }
      else { bySkill.set(r.skillId, { status: r.valid ? "passed" : "failed", errors: r.valid ? [] : [...errs] }); }
    }
    const results = Array.from(bySkill.entries()).map(([skill, v]) => v.errors.length ? { skill, status: "failed" as const, errors: v.errors } : { skill, status: v.status });
    sendOk(res, { total: report.passed + report.failed, passed: report.passed, failed: report.failed, skipped: 0, results });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentLayoutLint(res: import("node:http").ServerResponse): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const report = await runLayoutLint(resolver);
    const issues = report.errors.map((issue) => ({ path: "skills/", issue, severity: "error" as const }));
    sendOk(res, { valid: report.ok, issues });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

function parseQuery(url: string): Record<string, string> {
  const q = url?.split("?")[1];
  if (!q) return {};
  const out: Record<string, string> = {};
  for (const part of q.split("&")) {
    const [k, v] = part.split("=").map((s) => decodeURIComponent(s.replace(/\+/g, " ")));
    if (k) out[k] = v ?? "";
  }
  return out;
}

async function handler(req: import("node:http").IncomingMessage, res: import("node:http").ServerResponse): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  const pathStr = url.split("?")[0];
  const query = parseQuery(url);
  const { segments } = parsePath(pathStr);

  if (method === "OPTIONS") { res.writeHead(204, CORS_HEADERS); res.end(); return; }

  if (pathStr === "/health" && method === "GET") {
    const resolver = getSkillsResolver();
    const names = await getSkillNamesAsync(resolver).catch(() => []);
    const hasOpenrouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    const backends: string[] = ["openrouter"];
    try { await import("./backends/llamaCpp.js"); backends.push("llama-cpp"); } catch { /* optional */ }
    sendOk(res, { version: "2.2.0", uptime: Math.floor((Date.now() - serverStartedAt) / 1000), skills: names.length, hasOpenrouterKey, backends: [...new Set(backends)] });
    return;
  }

  const auth = requireAuth(req);
  if (!auth.ok) { sendError(res, auth.status, auth.message, "UNAUTHORIZED"); return; }

  if (pathStr === "/" || pathStr === "") {
    sendOk(res, {
      name: "aifunctions", version: "2.2.0",
      endpoints: {
        "GET /health": "Health check",
        "GET /config/modes": "Server mode→model mapping (weak, normal, strong, ultra)",
        "GET /skills": "List functions (legacy alias endpoint)", "GET /skills/:name": "Function detail (legacy alias endpoint)",
        "POST /skills/:name/run": "Run function (legacy alias endpoint)",
        "POST /run": "Run function (body: { skill, input, options })",
        "POST /optimize/instructions": "Optimize raw instructions",
        "POST /optimize/skill": "Optimize one function in-place",
        "POST /optimize/batch": "Optimize multiple functions (job)",
        "POST /optimize/judge": "Score a response against rules",
        "POST /optimize/rules": "Generate judge rules from examples or instructions",
        "POST /optimize/rules-optimize": "Optimize existing judge rules from examples with rationale (append/replace)",
        "POST /optimize/fix": "Fix instructions from judge feedback",
        "POST /optimize/compare": "Compare 2+ responses by quality",
        "POST /optimize/generate": "Generate instructions from test cases (job)",
        "POST /race/models": "Race models (job)",
        "GET /models/available": "List models available via OpenRouter",
        "GET /activity": "Server-side activity log (query: from, to, functionId, projectId, model, limit)",
        "POST /content/sync": "Content sync", "POST /content/index": "Build library index",
        "POST /content/index/full": "Build + return full embedded library index",
        "POST /content/fixtures": "Run fixtures", "POST /content/layout-lint": "Layout lint",
        "GET /functions": "List functions", "POST /functions": "Create function",
        "POST /functions/generate-examples": "Generate good/bad examples from description",
        "GET /functions/:id": "Function detail",
        "POST /functions/:id/run": "Run function",
        "POST /functions/:id:optimize": "Optimize function instructions (job)",
        "POST /functions/:id:validate": "Validate function quality",
        "POST /functions/:id:release": "Release function (score-gated)",
        "POST /functions/:id:rollback": "Set current instructions/rules to a previous version (body: { version: gitRef })",
        "POST /functions/:id:push": "Push to remote git",
        "GET /functions/:id/versions": "Version history",
        "POST /functions/:id/versions/:version/run": "Run function at pinned version (ref = git sha)",
        "GET /functions/:id/profiles": "Race winner profiles and defaults",
        "GET /functions/:id/race-report": "Race history (query: last, since, raceId)",
        "GET /functions/:id/test-cases": "Get test cases",
        "PUT /functions/:id/test-cases": "Set test cases",
        "POST /functions/:id/save-optimization": "Save optimization results (instructions, rules, examples)",
        "GET /jobs": "List jobs", "GET /jobs/:id": "Job status", "GET /jobs/:id/logs": "Job logs",
        "GET /analytics/openrouter/credits": "OpenRouter account balance and usage",
        "GET /analytics/openrouter/generations": "OpenRouter generation records (query: dateMin, dateMax, model, userTag, limit)",
        "GET /analytics/openai/usage": "OpenAI org usage buckets — requires OPENAI_ADMIN_KEY (query: startTime, endTime, groupBy, projectIds, models, limit)",
        "GET /analytics/openai/costs": "OpenAI org cost buckets — requires OPENAI_ADMIN_KEY (query: startTime, endTime, groupBy, projectIds, limit)",
      },
    });
    return;
  }

  // --- /config/modes ---
  if (pathStr === "/config/modes" && method === "GET") {
    await handleConfigModes(res);
    return;
  }

  // --- /models/available ---
  if (pathStr === "/models/available" && method === "GET") {
    try {
      const byokKey = extractByokKey(req);
      const apiKey = byokKey ?? process.env.OPENROUTER_API_KEY?.trim();
      if (!apiKey) {
        sendError(res, 422, "Provide x-openrouter-key header or set OPENROUTER_API_KEY", "MISSING_ENV");
        return;
      }
      const result = await fetchOpenRouterModels(apiKey);
      sendOk(res, result);
    } catch (e) {
      sendError(res, 502, e instanceof Error ? e.message : String(e), "ANALYTICS_ERROR");
    }
    return;
  }

  // --- /activity ---
  if (pathStr === "/activity" && method === "GET") {
    await handleActivity(res, query as Record<string, string | undefined>);
    return;
  }

  // --- /skills ---
  if (segments[0] === "skills") {
    if (pathStr === "/skills" && method === "GET") { await handleSkillsList(res, query); return; }
    if (method === "GET" && segments.length === 2) { await handleSkillDetail(res, segments[1]!); return; }
    if (method === "POST" && segments.length === 3 && segments[2] === "run") {
      try {
        const body = await readJsonBody(req);
        const rlKey = getRateLimitKey(req);
        const rl = consumeRateLimit(rlKey);
        if (!rl.allowed) {
          sendError(res, 429, "Rate limit exceeded", "RATE_LIMIT_EXCEEDED", rateLimitHeaders(rl));
          return;
        }
        await handleRun(res, body, segments[1], req, rl);
      } catch (e) {
        const err = e as { status?: number; code?: string; message?: string };
        if (err.status === 413 || err.code === "PAYLOAD_TOO_LARGE") {
          sendError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
          return;
        }
        sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
      }
      return;
    }
  }

  // --- /run ---
  if (pathStr === "/run" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      const rlKey = getRateLimitKey(req);
      const rl = consumeRateLimit(rlKey);
      if (!rl.allowed) {
        sendError(res, 429, "Rate limit exceeded", "RATE_LIMIT_EXCEEDED", rateLimitHeaders(rl));
        return;
      }
      await handleRun(res, body, undefined, req, rl);
    } catch (e) {
      const err = e as { status?: number; code?: string; message?: string };
      if (err.status === 413 || err.code === "PAYLOAD_TOO_LARGE") {
        sendError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
        return;
      }
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  // --- /optimize/* ---
  const optimizeHandlers: Record<string, (res: import("node:http").ServerResponse, body: unknown) => Promise<void>> = {
    "/optimize/instructions": (r, b) => handleOptimizeInstructions(r, b),
    "/optimize/skill": (r, b) => handleOptimizeSkill(r, b),
    "/optimize/batch": (r, b) => handleOptimizeBatch(r, b),
  };
  if (optimizeHandlers[pathStr] && method === "POST") {
    try { const body = await readJsonBody(req); await optimizeHandlers[pathStr]!(res, body); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }
  if (pathStr === "/optimize/judge" && method === "POST") {
    try { const body = await readJsonBody(req); await handleOptimizeJudge(res, body, req); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }
  if (pathStr === "/optimize/rules" && method === "POST") {
    try { const body = await readJsonBody(req); await handleOptimizeRules(res, body, req); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }
  if (pathStr === "/optimize/rules-optimize" && method === "POST") {
    try { const body = await readJsonBody(req); await handleOptimizeRulesOptimize(res, body, req); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }
  if (pathStr === "/optimize/fix" && method === "POST") {
    try { const body = await readJsonBody(req); await handleOptimizeFix(res, body, req); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }
  if (pathStr === "/optimize/compare" && method === "POST") {
    try { const body = await readJsonBody(req); await handleOptimizeCompare(res, body, req); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }
  if (pathStr === "/optimize/generate" && method === "POST") {
    try { const body = await readJsonBody(req); await handleOptimizeGenerate(res, body, req); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }

  // --- /race/models ---
  if (pathStr === "/race/models" && method === "POST") {
    try { const body = await readJsonBody(req); await handleRaceModels(res, body); }
    catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
    return;
  }

  // --- /content/* ---
  if (pathStr === "/content/sync" && method === "POST") { try { const body = await readJsonBody(req); await handleContentSync(res, body); } catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); } return; }
  if (pathStr === "/content/index" && method === "POST") { try { const body = await readJsonBody(req); await handleContentIndex(res, body); } catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); } return; }
  if (pathStr === "/content/index/full" && method === "POST") { try { const body = await readJsonBody(req); await handleContentIndexFull(res, body); } catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); } return; }
  if (pathStr === "/content/fixtures" && method === "POST") { try { const body = await readJsonBody(req); await handleContentFixtures(res, body); } catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); } return; }
  if (pathStr === "/content/layout-lint" && method === "POST") { try { await handleContentLayoutLint(res); } catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); } return; }

  // --- /functions/* ---
  if (segments[0] === "functions") {
    const fnSegment = segments[1]; // may include colon-action e.g. "myId:validate"

    if (pathStr === "/functions" && method === "GET") { await handleSkillsList(res, query); return; }
    if (pathStr === "/functions" && method === "POST") {
      try { const body = await readJsonBody(req); await handleCreateFunction(res, body); }
      catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
      return;
    }
    if (pathStr === "/functions/generate-examples" && method === "POST") {
      try { const body = await readJsonBody(req); await handleGenerateExamples(res, body, req); }
      catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
      return;
    }

    if (fnSegment) {
      // Colon-action routes: /functions/myId:validate, :release, :rollback, :push, :optimize
      const colonActions = [":validate", ":release", ":rollback", ":push", ":optimize"] as const;
      for (const action of colonActions) {
        if (method === "POST" && segments.length === 2 && fnSegment.endsWith(action)) {
          const cleanId = fnSegment.slice(0, -action.length);
          if (action === ":validate") { await handleValidateFunction(res, cleanId, req); return; }
          if (action === ":release") { await handleReleaseFunction(res, cleanId); return; }
          if (action === ":rollback") {
            try { const body = await readJsonBody(req); await handleRollbackFunction(res, cleanId, body); }
            catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
            return;
          }
          if (action === ":push") { await handleFunctionPush(res, cleanId); return; }
          if (action === ":optimize") {
            try { const body = await readJsonBody(req); await handleFunctionOptimize(res, body, cleanId); }
            catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
            return;
          }
        }
      }

      // POST /functions/:id/versions/:version/run — run at pinned version (ref = git sha)
      if (method === "POST" && segments.length === 5 && segments[2] === "versions" && segments[4] === "run") {
        const versionRef = segments[3]!;
        try {
          const body = await readJsonBody(req);
          const names = await getSkillNamesAsync(getSkillsResolver());
          if (!names.includes(fnSegment)) {
            sendError(res, 404, `Function '${fnSegment}' not found`, "FUNCTION_NOT_FOUND");
            return;
          }
          const rlKey = getRateLimitKey(req);
          const rl = consumeRateLimit(rlKey);
          if (!rl.allowed) {
            sendError(res, 429, "Rate limit exceeded", "RATE_LIMIT_EXCEEDED", rateLimitHeaders(rl));
            return;
          }
          await handleRunVersioned(res, body, fnSegment, versionRef, req, rl);
        } catch (e) {
          const err = e as { status?: number; code?: string; message?: string };
          if (err.status === 413 || err.code === "PAYLOAD_TOO_LARGE") {
            sendError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
            return;
          }
          sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
        }
        return;
      }

      // Sub-resource routes: /functions/:id/run, /optimize, /versions, /test-cases
      if (segments.length === 3) {
        const sub = segments[2]!;
        if (method === "POST" && sub === "run") {
          try {
            const body = await readJsonBody(req);
            const rlKey = getRateLimitKey(req);
            const rl = consumeRateLimit(rlKey);
            if (!rl.allowed) {
              sendError(res, 429, "Rate limit exceeded", "RATE_LIMIT_EXCEEDED", rateLimitHeaders(rl));
              return;
            }
            await handleRun(res, body, fnSegment, req, rl);
          } catch (e) {
            const err = e as { status?: number; code?: string; message?: string };
            if (err.status === 413 || err.code === "PAYLOAD_TOO_LARGE") {
              sendError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
              return;
            }
            sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
          }
          return;
        }
        if (method === "POST" && sub === "optimize") {
          try { const body = await readJsonBody(req); await handleFunctionOptimize(res, body, fnSegment); }
          catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
          return;
        }
        if (method === "GET" && sub === "versions") { await handleFunctionVersions(res, fnSegment); return; }
        if (method === "GET" && sub === "profiles") { await handleGetFunctionProfiles(res, fnSegment); return; }
        if (method === "GET" && sub === "race-report") { await handleGetFunctionRaceReport(res, fnSegment, query as Record<string, string | undefined>); return; }
        if (method === "GET" && sub === "test-cases") { await handleGetFunctionTestCases(res, fnSegment); return; }
        if (method === "PUT" && sub === "test-cases") {
          try { const body = await readJsonBody(req); await handlePutFunctionTestCases(res, body, fnSegment); }
          catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
          return;
        }
        if (method === "POST" && sub === "save-optimization") {
          try { const body = await readJsonBody(req); await handleSaveOptimization(res, body, fnSegment); }
          catch (e) { sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT"); }
          return;
        }
      }

      // GET /functions/:id
      if (method === "GET" && segments.length === 2) { await handleGetFunction(res, fnSegment); return; }
    }
  }

  // --- /jobs/* ---
  if (segments[0] === "jobs") {
    if (pathStr === "/jobs" && method === "GET") {
      const status = query.status as "running" | "completed" | "failed" | undefined;
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);
      const { jobs, total } = listJobs({ status, limit, offset });
      sendOk(res, { jobs: jobs.map((j) => ({ id: j.id, type: j.type ?? "unknown", status: j.status, progress: j.progress ?? 0, createdAt: new Date(j.createdAt).toISOString(), updatedAt: new Date(j.updatedAt).toISOString() })), total });
      return;
    }
    if (segments.length >= 2) {
      const jobId = segments[1]!;
      if (method === "GET" && segments.length === 2) {
        const job = getJob(jobId);
        if (!job) { sendError(res, 404, "Job not found or expired", "JOB_NOT_FOUND"); return; }
        const data: Record<string, unknown> = { id: job.id, type: job.type ?? "unknown", status: job.status, progress: job.progress ?? 0, createdAt: new Date(job.createdAt).toISOString(), updatedAt: new Date(job.updatedAt).toISOString(), result: job.result ?? null };
        if (job.status === "completed") data.completedAt = new Date(job.updatedAt).toISOString();
        if (job.status === "failed") { data.failedAt = new Date(job.updatedAt).toISOString(); data.error = { code: job.errorCode ?? "JOB_FAILED", message: job.error ?? "Job failed" }; }
        sendOk(res, data); return;
      }
      if (method === "GET" && segments.length === 3 && segments[2] === "logs") {
        const logs = getJobLogs(jobId);
        if (logs === null) { sendError(res, 404, "Job not found or expired", "JOB_NOT_FOUND"); return; }
        sendOk(res, { logs: logs.map((line) => ({ ts: new Date().toISOString(), level: "info", message: line.trim() })) });
        return;
      }
    }
  }

  // --- /analytics/* ---
  if (segments[0] === "analytics") {
    const provider = segments[1];
    const resource = segments[2];

    // GET /analytics/openrouter/credits
    if (method === "GET" && provider === "openrouter" && resource === "credits") {
      try {
        const byokKey = extractByokKey(req);
        const apiKey = byokKey ?? process.env.OPENROUTER_API_KEY?.trim();
        if (!apiKey) { sendError(res, 422, "Provide x-openrouter-key header or set OPENROUTER_API_KEY", "MISSING_ENV"); return; }
        const result = await fetchOpenRouterCredits(apiKey);
        sendOk(res, result);
      } catch (e) {
        sendError(res, 502, e instanceof Error ? e.message : String(e), "ANALYTICS_ERROR");
      }
      return;
    }

    // GET /analytics/openrouter/generations
    if (method === "GET" && provider === "openrouter" && resource === "generations") {
      try {
        const byokKey = extractByokKey(req);
        const apiKey = byokKey ?? process.env.OPENROUTER_API_KEY?.trim();
        if (!apiKey) { sendError(res, 422, "Provide x-openrouter-key header or set OPENROUTER_API_KEY", "MISSING_ENV"); return; }
        const result = await fetchOpenRouterGenerations(apiKey, {
          dateMin: query.dateMin,
          dateMax: query.dateMax,
          model: query.model,
          userTag: query.userTag,
          limit: query.limit ? Math.min(1000, Math.max(1, Number(query.limit))) : undefined,
        });
        sendOk(res, result);
      } catch (e) {
        sendError(res, 502, e instanceof Error ? e.message : String(e), "ANALYTICS_ERROR");
      }
      return;
    }

    // GET /analytics/openai/usage
    if (method === "GET" && provider === "openai" && resource === "usage") {
      try {
        if (!query.startTime) { sendError(res, 400, "startTime (Unix timestamp) is required", "INVALID_INPUT"); return; }
        const groupBy = query.groupBy ? query.groupBy.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
        const projectIds = query.projectIds ? query.projectIds.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
        const models = query.models ? query.models.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
        const result = await fetchOpenAIUsage({
          startTime: Number(query.startTime),
          endTime: query.endTime ? Number(query.endTime) : undefined,
          groupBy,
          projectIds,
          models,
          limit: query.limit ? Math.min(1000, Math.max(1, Number(query.limit))) : undefined,
        });
        sendOk(res, result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("OPENAI_ADMIN_KEY")) { sendError(res, 422, msg, "MISSING_ENV"); return; }
        sendError(res, 502, msg, "ANALYTICS_ERROR");
      }
      return;
    }

    // GET /analytics/openai/costs
    if (method === "GET" && provider === "openai" && resource === "costs") {
      try {
        if (!query.startTime) { sendError(res, 400, "startTime (Unix timestamp) is required", "INVALID_INPUT"); return; }
        const groupBy = query.groupBy ? query.groupBy.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
        const projectIds = query.projectIds ? query.projectIds.split(",").map((s) => s.trim()).filter(Boolean) : undefined;
        const result = await fetchOpenAICosts({
          startTime: Number(query.startTime),
          endTime: query.endTime ? Number(query.endTime) : undefined,
          groupBy,
          projectIds,
          limit: query.limit ? Math.min(1000, Math.max(1, Number(query.limit))) : undefined,
        });
        sendOk(res, result);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("OPENAI_ADMIN_KEY")) { sendError(res, 422, msg, "MISSING_ENV"); return; }
        sendError(res, 502, msg, "ANALYTICS_ERROR");
      }
      return;
    }
  }

  sendError(res, 404, "Not found", "NOT_FOUND");
}

const server = createServer((req, res) => {
  handler(req, res).catch((e) => {
    const err = e as { status?: number; code?: string; message?: string };
    if (err.status === 413 || err.code === "PAYLOAD_TOO_LARGE") {
      sendError(res, 413, "Request body too large", "PAYLOAD_TOO_LARGE");
      return;
    }
    sendError(res, 500, e instanceof Error ? e.message : String(e), "SERVER_ERROR");
  });
});

server.listen(PORT, () => {
  console.log(`aifunctions REST API v2.2.0 on http://localhost:${PORT}`);
  console.log("  GET  /health, GET /");
  console.log("  GET/POST /skills, POST /run");
  console.log("  POST /optimize/{instructions,skill,batch,judge,rules,fix,compare,generate}");
  console.log("  GET/POST /functions, GET /functions/:id");
  console.log("  POST /functions/:id:{optimize,validate,release,push}");
  console.log("  GET /functions/:id/{versions,test-cases}, PUT /functions/:id/test-cases");
  console.log("  POST /race/models, POST /content/{sync,index,index/full,fixtures,layout-lint}");
  console.log("  GET /jobs, GET /jobs/:id, GET /jobs/:id/logs");
  console.log("  GET /analytics/openrouter/{credits,generations}");
  console.log("  GET /analytics/openai/{usage,costs}  (requires OPENAI_ADMIN_KEY)");
});
