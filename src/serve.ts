/**
 * REST API server for aifunctions. Run with: npm run serve
 * Exposes skill run, optimize, race, content workflows, and jobs. No UI.
 */
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getSkillsResolver, getLibraryIndex, updateLibraryIndex } from "./index.js";
import {
  run,
  getSkillNames,
  getSkillNamesAsync,
  optimizeInstruction,
  raceModels,
} from "../functions/index.js";
import {
  getSkillInstructions,
  setSkillInstructions,
} from "./index.js";
import { runFixtures } from "./content/runFixtures.js";
import { runLayoutLint } from "./content/lintContentLayout.js";
import { requireAuth } from "./serve/auth.js";
import {
  createJob,
  getJob,
  updateJob,
  appendJobLog,
  getJobLogs,
  listJobs,
} from "./serve/jobs.js";
// API contract: https://api.aifunction.dev — standard envelope, status codes, CORS https://api.aifunction.dev — standard envelope, status codes, CORS
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

function readJsonBody(req: import("node:http").IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body.trim()) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, x-api-key, x-openrouter-key",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function sendOk(res: import("node:http").ServerResponse, data: unknown) {
  res.writeHead(200, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify({ ok: true, data }));
}

function sendError(
  res: import("node:http").ServerResponse,
  status: number,
  message: string,
  code: string
) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS_HEADERS });
  res.end(JSON.stringify({ ok: false, error: { code, message } }));
}

function parsePath(pathStr: string): { segments: string[]; name?: string; id?: string } {
  const segments = pathStr.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
  const name = segments[1]; // /skills/:name
  const id = segments[1]; // /jobs/:id
  return { segments, name, id };
}

// --- Handlers ---

async function handleRun(
  res: import("node:http").ServerResponse,
  body: unknown,
  skillFromPath?: string
): Promise<void> {
  const skill = skillFromPath ?? (body as { skill?: string })?.skill;
  const rawBody = body as { input?: unknown; request?: unknown; options?: { validate?: boolean } };
  const request = rawBody?.input ?? rawBody?.request ?? body;
  const validateOption = rawBody?.options?.validate;
  if (typeof skill !== "string" || !skill.trim()) {
    sendError(res, 400, "skill must be a non-empty string", "INVALID_INPUT");
    return;
  }
  const resolver = getSkillsResolver();
  const validateOutput =
    validateOption === true ||
    process.env.VALIDATE_SKILL_OUTPUT === "1" ||
    process.env.VALIDATE_SKILL_OUTPUT === "true";
  try {
    const out = await concurrencyGuard(() =>
      run(skill.trim(), request ?? {}, { resolver, validateOutput })
    );
    if (validateOutput && typeof out === "object" && out !== null && "validation" in out) {
      const { result, validation } = out as { result: unknown; validation: { valid: boolean; errors?: string[] } };
      sendOk(res, {
        result,
        validation: { valid: validation.valid, errors: validation.errors ?? [] },
      });
    } else {
      sendOk(res, { result: out });
    }
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) {
      sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL");
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unknown skill")) {
      sendError(res, 404, `Skill '${skill.trim()}' not found`, "SKILL_NOT_FOUND");
    } else {
      sendError(res, 500, message, "RUN_ERROR");
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
    try {
      index = await getLibraryIndex({ resolver, allowMissing: true });
    } catch {
      // no index
    }
    const byId = new Map<string, { $refKey: string; entry?: Record<string, unknown> }>();
    if (index?.skills) {
      for (const ref of index.skills) {
        const r = ref as { $refKey: string };
        try {
          const raw = await resolver.get(r.$refKey);
          const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as Record<string, unknown> & { id?: string };
          if (entry.id) byId.set(entry.id as string, { $refKey: r.$refKey, entry });
        } catch {
          // skip
        }
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
      skills = skills.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.description && String(s.description).toLowerCase().includes(q))
      );
    }
    sendOk(res, { skills });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleSkillDetail(
  res: import("node:http").ServerResponse,
  name: string
): Promise<void> {
  try {
    const resolver = getSkillsResolver();
    const names = await getSkillNamesAsync(resolver);
    if (!names.includes(name)) {
      sendError(res, 404, `Skill '${name}' not found`, "SKILL_NOT_FOUND");
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
    } catch {
      // no index
    }
    const instructions: Record<string, string> = { weak: "Available", strong: "Available", ultra: "Not configured" };
    if (entry && typeof entry === "object" && entry !== null) {
      sendOk(res, {
        ...entry,
        name: entry.id ?? name,
        version: (entry as { schemaVersion?: string }).schemaVersion ?? "1.0.0",
        examples: (entry as { examples?: unknown[] }).examples ?? [],
        instructions,
      });
    } else {
      sendOk(res, { name, version: "1.0.0", examples: [], instructions });
    }
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleOptimizeInstructions(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const b = body as {
    instructions?: string;
    skillName?: string | null;
    mode?: "weak" | "strong";
    examples?: unknown[];
    model?: string;
    maxTokens?: number;
  };
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
      usage: {
        promptTokens: result.usage.promptTokens,
        completionTokens: result.usage.completionTokens,
        totalTokens: result.usage.totalTokens,
        estimatedCost: undefined,
      },
    });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) {
      sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL");
      return;
    }
    sendError(res, 500, e instanceof Error ? (e as Error).message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleOptimizeSkill(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const b = body as { skillName?: string; mode?: "weak" | "strong"; runValidation?: boolean };
  const skillName = b?.skillName;
  if (!skillName || typeof skillName !== "string") {
    sendError(res, 400, "skillName is required", "INVALID_INPUT");
    return;
  }
  const resolver = getSkillsResolver();
  const mode = b?.mode === "weak" ? "weak" : "normal";
  try {
    const before = await getSkillInstructions(resolver, skillName);
    if (!before?.trim()) {
      sendError(res, 404, `No instructions for skill: ${skillName}`, "SKILL_NOT_FOUND");
      return;
    }
    const result = await concurrencyGuard(() =>
      optimizeInstruction(before, mode, skillName)
    );
    await setSkillInstructions(resolver, skillName, result.optimized);
    const validationSummary = b?.runValidation
      ? await runFixtures({ resolver, skillName }).then((r) => ({ ok: r.ok, failed: r.failed }))
      : undefined;
    sendOk(res, {
      before,
      after: result.optimized,
      validationSummary,
      usage: result.usage,
    });
  } catch (e: unknown) {
    const err = e as { code?: string; status?: number; message?: string };
    if (err.code === "QUEUE_FULL" && err.status === 503) {
      sendError(res, 503, err.message ?? "Server busy", "QUEUE_FULL");
      return;
    }
    sendError(res, 500, e instanceof Error ? (e as Error).message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleOptimizeBatch(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const b = body as {
    skills?: string[];
    prefix?: string;
    tag?: string;
    mode?: "weak" | "strong";
    concurrency?: number;
    continueOnError?: boolean;
  };
  const resolver = getSkillsResolver();
  let skills: string[] = b?.skills ?? [];
  if (skills.length === 0) {
    const all = await getSkillNamesAsync(resolver);
    skills = all.filter((n) => n !== "ai.ask");
  }
  const { id, job } = createJob("batch", { totalSkills: skills.length });
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
          if (!before?.trim()) {
            results.push({ skillName, ok: false, error: "No instructions" });
            if (!continueOnError) break;
            continue;
          }
          const result = await optimizeInstruction(before, mode, skillName);
          await setSkillInstructions(resolver, skillName, result.optimized);
          results.push({ skillName, ok: true });
        } catch (e) {
          results.push({
            skillName,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
          if (!continueOnError) break;
        }
      }
      updateJob(id, { status: "completed", progress: 1, result: { results } });
    } catch (e) {
      updateJob(id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        errorCode: "OPTIMIZE_ERROR",
      });
    }
  })();
}

async function handleRaceModels(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  if (body == null || typeof body !== "object") {
    sendError(res, 400, "Body must be RaceModelsRequest object", "INVALID_INPUT");
    return;
  }
  const req = body as { testCases?: unknown[]; candidates?: unknown[] };
  const totalRuns = (req.testCases?.length ?? 1) * (req.candidates?.length ?? 1);
  const { id } = createJob("race", { totalRuns });
  updateJob(id, { status: "running" });
  sendOk(res, { jobId: id, status: "running", totalRuns });

  (async () => {
    try {
      const result = await concurrencyGuard(() => raceModels(body as Parameters<typeof raceModels>[0]));
      updateJob(id, { status: "completed", progress: 1, result });
    } catch (e) {
      updateJob(id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
        errorCode: "OPENROUTER_HTTP_ERROR",
      });
    }
  })();
}

async function handleContentSync(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { dryRun?: boolean; optimize?: boolean }) ?? {};
  if (b.optimize) {
    const { id } = createJob("content-sync");
    updateJob(id, { status: "running" });
    const args = ["run", "content:sync:no-test", "--", "--no-push", "--optimize"];
    if (b.dryRun) args.push("--dry-run");
    const child = spawn("npm", args, {
      cwd: rootDir,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env },
    });
    child.stdout?.on("data", (chunk) => appendJobLog(id, chunk.toString()));
    child.stderr?.on("data", (chunk) => appendJobLog(id, chunk.toString()));
    child.on("close", (code) => {
      updateJob(id, {
        status: code === 0 ? "completed" : "failed",
        result: code === 0 ? { ok: true } : undefined,
        error: code !== 0 ? `Exit code ${code}` : undefined,
        errorCode: code !== 0 ? "MISSING_OPTIONAL_DEP" : undefined,
      });
    });
    sendOk(res, { jobId: id, status: "running" });
    return;
  }
  try {
    const resolver = getSkillsResolver();
    const report = await updateLibraryIndex({
      resolver,
      prefix: "skills/",
      dryRun: b.dryRun ?? false,
    });
    const st = report.stats;
    sendOk(res, {
      synced: (st?.skillsUpdated ?? 0) + (st?.skillsUnchanged ?? 0),
      created: 0,
      updated: st?.skillsUpdated ?? 0,
      unchanged: st?.skillsUnchanged ?? 0,
      errors: report.errors?.map((e: { reason?: string }) => e.reason ?? String(e)) ?? [],
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentIndex(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { root?: string; prefix?: string }) ?? {};
  const resolver = getSkillsResolver();
  try {
    const report = await updateLibraryIndex({
      resolver,
      prefix: b.prefix ?? "skills/",
      dryRun: false,
    });
    const skills: string[] = (report.refKeys ?? []).map((key: string) => {
      const m = key.match(/[^/]+\.json$/);
      return m ? m[0].replace(".json", "") : key;
    });
    sendOk(res, {
      indexed: report.stats?.skillsTotal ?? 0,
      skills,
      errors: report.errors?.map((e: { reason?: string }) => e.reason ?? String(e)) ?? [],
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentFixtures(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const b = (body as { action?: string; skillName?: string; prefix?: string }) ?? {};
  const resolver = getSkillsResolver();
  try {
    const report = await runFixtures({
      resolver,
      skillName: b.skillName,
    });
    const bySkill = new Map<string, { status: "passed" | "failed"; errors: string[] }>();
    for (const r of report.results) {
      const key = r.skillId;
      const existing = bySkill.get(key);
      const hasError = !r.valid;
      const errs = (r.errors ?? []) as string[];
      if (existing) {
        if (hasError) {
          existing.status = "failed";
          existing.errors.push(...errs);
        }
      } else {
        bySkill.set(key, {
          status: hasError ? "failed" : "passed",
          errors: hasError ? [...errs] : [],
        });
      }
    }
    const results = Array.from(bySkill.entries()).map(([skill, v]) =>
      v.errors.length ? { skill, status: "failed" as const, errors: v.errors } : { skill, status: v.status }
    );
    const total = report.passed + report.failed;
    sendOk(res, {
      total,
      passed: report.passed,
      failed: report.failed,
      skipped: 0,
      results,
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "MISSING_OPTIONAL_DEP");
  }
}

async function handleContentLayoutLint(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const report = await runLayoutLint(resolver);
    const issues = report.errors.map((issue) => ({
      path: "skills/",
      issue,
      severity: "error" as const,
    }));
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

async function handler(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
): Promise<void> {
  const method = req.method ?? "GET";
  const url = req.url ?? "/";
  const pathStr = url.split("?")[0];
  const query = parseQuery(url);
  const { segments, name, id } = parsePath(pathStr);

  if (method === "OPTIONS") {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  if (pathStr === "/health" && method === "GET") {
    const resolver = getSkillsResolver();
    const names = await getSkillNamesAsync(resolver).catch(() => []);
    const hasOpenrouterKey = Boolean(process.env.OPENROUTER_API_KEY?.trim());
    const backends: string[] = ["openrouter"];
    try {
      await import("./backends/llamaCpp.js");
      backends.push("llama-cpp");
    } catch {
      // optional
    }
    sendOk(res, {
      version: "2.1.0",
      uptime: Math.floor((Date.now() - serverStartedAt) / 1000),
      skills: names.length,
      hasOpenrouterKey,
      backends: [...new Set(backends)],
    });
    return;
  }

  const auth = requireAuth(req);
  if (!auth.ok) {
    sendError(res, auth.status, auth.message, "UNAUTHORIZED");
    return;
  }

  if (pathStr === "/" || pathStr === "") {
    sendOk(res, {
      name: "aifunctions",
      version: "2.1.0",
      endpoints: {
        "GET /health": "Health check",
        "GET /skills": "List skills with metadata",
        "GET /skills/:name": "Skill details",
        "POST /skills/:name/run": "Run skill (body: { input, options })",
        "POST /run": "Run skill (body: { skill, request, options })",
        "POST /optimize/instructions": "Optimize raw or skill instructions",
        "POST /optimize/skill": "Optimize one skill",
        "POST /optimize/batch": "Optimize multiple skills",
        "POST /race/models": "Race models (RaceModelsRequest)",
        "POST /content/sync": "Content sync (returns job or data)",
        "POST /content/index": "Build library index",
        "POST /content/fixtures": "Run fixtures",
        "POST /content/layout-lint": "Layout lint",
        "GET /jobs": "List jobs",
        "GET /jobs/:id": "Job status",
        "GET /jobs/:id/logs": "Job logs",
      },
    });
    return;
  }

  if (segments[0] === "skills") {
    if (method === "GET" && segments.length === 2) {
      await handleSkillDetail(res, segments[1]!);
      return;
    }
    if (method === "POST" && segments.length === 3 && segments[2] === "run") {
      const body = await readJsonBody(req);
      await handleRun(res, body, segments[1]);
      return;
    }
    if (pathStr === "/skills" && method === "GET") {
      await handleSkillsList(res, query);
      return;
    }
  }

  if (pathStr === "/run" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleRun(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/optimize/instructions" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleOptimizeInstructions(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/optimize/skill" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleOptimizeSkill(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/optimize/batch" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleOptimizeBatch(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/race/models" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleRaceModels(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/content/sync" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentSync(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/content/index" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentIndex(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/content/fixtures" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentFixtures(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (pathStr === "/content/layout-lint" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentLayoutLint(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "INVALID_INPUT");
    }
    return;
  }

  if (segments[0] === "jobs") {
    if (pathStr === "/jobs" && method === "GET") {
      const status = query.status as "running" | "completed" | "failed" | undefined;
      const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
      const offset = Math.max(0, Number(query.offset) || 0);
      const { jobs, total } = listJobs({ status, limit, offset });
      const list = jobs.map((j) => ({
        id: j.id,
        type: j.type ?? "unknown",
        status: j.status,
        progress: j.progress ?? 0,
        createdAt: new Date(j.createdAt).toISOString(),
        updatedAt: new Date(j.updatedAt).toISOString(),
      }));
      sendOk(res, { jobs: list, total });
      return;
    }
    if (segments.length === 2) {
      const jobId = segments[1]!;
      if (method === "GET" && !pathStr.endsWith("/logs")) {
        const job = getJob(jobId);
        if (!job) {
          sendError(res, 404, "Job not found or expired", "JOB_NOT_FOUND");
          return;
        }
        const data: Record<string, unknown> = {
          id: job.id,
          type: job.type ?? "unknown",
          status: job.status,
          progress: job.progress ?? 0,
          createdAt: new Date(job.createdAt).toISOString(),
          updatedAt: new Date(job.updatedAt).toISOString(),
          result: job.result ?? null,
        };
        if (job.status === "completed") data.completedAt = new Date(job.updatedAt).toISOString();
        if (job.status === "failed") {
          data.failedAt = new Date(job.updatedAt).toISOString();
          data.error = { code: job.errorCode ?? "JOB_FAILED", message: job.error ?? "Job failed" };
        }
        sendOk(res, data);
        return;
      }
      if (method === "GET" && pathStr === `/jobs/${jobId}/logs`) {
        const logs = getJobLogs(jobId);
        if (logs === null) {
          sendError(res, 404, "Job not found or expired", "JOB_NOT_FOUND");
          return;
        }
        const logEntries = logs.map((line) => ({
          ts: new Date().toISOString(),
          level: "info",
          message: line.trim(),
        }));
        sendOk(res, { logs: logEntries });
        return;
      }
    }
  }

  sendError(res, 404, "Not found", "NOT_FOUND");
}

const server = createServer((req, res) => {
  handler(req, res).catch((e) => {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "SERVER_ERROR");
  });
});

server.listen(PORT, () => {
  console.log(`aifunctions REST API listening on http://localhost:${PORT}`);
  console.log("  GET  /         - endpoint list");
  console.log("  GET  /health   - health check");
  console.log("  GET  /skills   - list skills");
  console.log("  GET  /skills/:name - skill details");
  console.log("  POST /skills/:name/run - run skill");
  console.log("  POST /run      - run skill (body: { skill, request })");
  console.log("  POST /optimize/instructions, /optimize/skill, /optimize/batch");
  console.log("  POST /race/models");
  console.log("  POST /content/sync, /content/index, /content/fixtures, /content/layout-lint");
  console.log("  GET  /jobs/:id, GET /jobs/:id/logs");
});
