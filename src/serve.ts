/**
 * REST API server for light-skills. Run with: npm run serve
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
} from "./serve/jobs.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const PORT = Number(process.env.PORT) || 3780;
const MAX_CONCURRENCY = Math.max(1, Number(process.env.MAX_CONCURRENCY) || 50);
let concurrency = 0;
const concurrencyGuard = <T>(fn: () => Promise<T>): Promise<T> => {
  if (concurrency >= MAX_CONCURRENCY) {
    return Promise.reject(new Error("Server busy (MAX_CONCURRENCY); retry later"));
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

const CORS = { "Access-Control-Allow-Origin": "*" };

function send(res: import("node:http").ServerResponse, status: number, data: unknown) {
  res.writeHead(status, { "Content-Type": "application/json", ...CORS });
  res.end(JSON.stringify(data));
}

function sendError(
  res: import("node:http").ServerResponse,
  status: number,
  message: string,
  code?: string
) {
  send(res, status, { error: message, code: code ?? "ERROR" });
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
  const request = (body as { request?: unknown })?.request ?? body;
  if (typeof skill !== "string" || !skill.trim()) {
    sendError(res, 400, "skill must be a non-empty string", "BAD_REQUEST");
    return;
  }
  const resolver = getSkillsResolver();
  const validateOutput =
    process.env.VALIDATE_SKILL_OUTPUT === "1" || process.env.VALIDATE_SKILL_OUTPUT === "true";
  try {
    const out = await concurrencyGuard(() =>
      run(skill.trim(), request ?? {}, { resolver, validateOutput })
    );
    if (validateOutput && typeof out === "object" && out !== null && "validation" in out) {
      send(res, 200, out);
    } else {
      send(res, 200, { result: out });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes("Unknown skill")) {
      sendError(res, 404, message, "UNKNOWN_SKILL");
    } else {
      sendError(res, 500, message, "RUN_ERROR");
    }
  }
}

async function handleSkillsList(res: import("node:http").ServerResponse): Promise<void> {
  try {
    const resolver = getSkillsResolver();
    const names = await getSkillNamesAsync(resolver);
    let index: Awaited<ReturnType<typeof getLibraryIndex>> | null = null;
    try {
      index = await getLibraryIndex({ resolver, allowMissing: true });
    } catch {
      // no index
    }
    const byId = new Map<string, { $refKey: string }>();
    if (index?.skills) {
      for (const ref of index.skills) {
        const r = ref as { $refKey: string };
        try {
          const raw = await resolver.get(r.$refKey);
          const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as { id?: string };
          if (entry.id) byId.set(entry.id, r);
        } catch {
          // skip
        }
      }
    }
    const skills = names.map((name) => {
      const meta = byId.get(name);
      return meta
        ? { name, version: "v1", description: "Skill from library index", tags: [] }
        : { name, version: "v1" };
    });
    send(res, 200, { skills });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "SKILLS_ERROR");
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
      sendError(res, 404, `Unknown skill: ${name}`, "UNKNOWN_SKILL");
      return;
    }
    let entry: unknown = null;
    try {
      const index = await getLibraryIndex({ resolver, allowMissing: true });
      const ref = index.skills?.find((r) => {
        const key = (r as { $refKey?: string }).$refKey;
        return key?.includes(`/${name}/`) || key?.endsWith(`/${name}`);
      }) as { $refKey: string } | undefined;
      if (ref) {
        const raw = await resolver.get(ref.$refKey);
        entry = JSON.parse(typeof raw === "string" ? raw : "{}");
      }
    } catch {
      // no index
    }
    if (entry && typeof entry === "object" && entry !== null) {
      send(res, 200, entry);
    } else {
      send(res, 200, { name, version: "v1" });
    }
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "SKILLS_ERROR");
  }
}

async function handleOptimizeInstructions(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const b = body as {
    rawInstructions?: string;
    skillName?: string;
    mode?: "weak" | "strong";
    model?: string;
    vendor?: string;
    temperature?: number;
    maxTokens?: number;
  };
  let rawInstructions = b?.rawInstructions;
  const skillName = typeof b?.skillName === "string" ? b.skillName : "unknown";
  const mode = b?.mode === "weak" ? "weak" : "normal";

  if (!rawInstructions && b?.skillName) {
    const resolver = getSkillsResolver();
    rawInstructions = await getSkillInstructions(resolver, b.skillName);
    if (!rawInstructions?.trim()) {
      sendError(res, 404, `No instructions found for skill: ${b.skillName}`, "NOT_FOUND");
      return;
    }
  }
  if (typeof rawInstructions !== "string" || !rawInstructions.trim()) {
    sendError(res, 400, "Provide rawInstructions or skillName", "BAD_REQUEST");
    return;
  }

  try {
    const result = await concurrencyGuard(() =>
      optimizeInstruction(rawInstructions!, mode, skillName, { model: b?.model })
    );
    send(res, 200, {
      optimizedInstructions: result.optimized,
      tokens: result.usage,
      validation: undefined,
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "OPTIMIZE_ERROR");
  }
}

async function handleOptimizeSkill(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const b = body as { skillName?: string; mode?: "weak" | "strong"; runValidation?: boolean };
  const skillName = b?.skillName;
  if (!skillName || typeof skillName !== "string") {
    sendError(res, 400, "skillName is required", "BAD_REQUEST");
    return;
  }
  const resolver = getSkillsResolver();
  const mode = b?.mode === "weak" ? "weak" : "normal";
  try {
    const before = await getSkillInstructions(resolver, skillName);
    if (!before?.trim()) {
      sendError(res, 404, `No instructions for skill: ${skillName}`, "NOT_FOUND");
      return;
    }
    const result = await concurrencyGuard(() =>
      optimizeInstruction(before, mode, skillName)
    );
    await setSkillInstructions(resolver, skillName, result.optimized);
    const validationSummary = b?.runValidation
      ? await runFixtures({ resolver, skillName }).then((r) => ({ ok: r.ok, failed: r.failed }))
      : undefined;
    send(res, 200, {
      before,
      after: result.optimized,
      validationSummary,
      tokens: result.usage,
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "OPTIMIZE_ERROR");
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
  const mode = b?.mode === "weak" ? "weak" : "normal";
  const continueOnError = b?.continueOnError === true;
  const results: Array<{ skillName: string; ok: boolean; error?: string }> = [];
  for (const skillName of skills) {
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
  send(res, 200, {
    results,
    summary: {
      total: skills.length,
      ok: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
  });
}

async function handleRaceModels(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  if (body == null || typeof body !== "object") {
    sendError(res, 400, "Body must be RaceModelsRequest object", "BAD_REQUEST");
    return;
  }
  try {
    const result = await concurrencyGuard(() => raceModels(body as Parameters<typeof raceModels>[0]));
    send(res, 200, result);
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "RACE_ERROR");
  }
}

async function handleContentSync(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { dryRun?: boolean; optimize?: boolean }) ?? {};
  const { id, job } = createJob();
  updateJob(id, { status: "running" });
  const args = ["run", "content:sync:no-test", "--", "--no-push"];
  if (b.dryRun) args.push("--dry-run");
  if (b.optimize) args.push("--optimize");
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
    });
  });
  send(res, 200, { ok: true, jobId: id });
}

async function handleContentIndex(res: import("node:http").ServerResponse, body: unknown): Promise<void> {
  const b = (body as { root?: string; prefix?: string }) ?? {};
  const { id, job } = createJob();
  updateJob(id, { status: "running" });
  const resolver = getSkillsResolver();
  updateLibraryIndex({
    resolver,
    prefix: b.prefix ?? "skills/",
    dryRun: false,
  })
    .then((report) => {
      updateJob(id, { status: "completed", result: { ok: true, summary: report } });
    })
    .catch((e) => {
      updateJob(id, {
        status: "failed",
        error: e instanceof Error ? e.message : String(e),
      });
    });
  send(res, 200, { ok: true, jobId: id });
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
    send(res, 200, {
      ok: report.ok,
      summary: { passed: report.passed, failed: report.failed, results: report.results },
      errors: report.results.filter((r) => !r.valid).map((r) => ({ ...r })),
    });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "FIXTURES_ERROR");
  }
}

async function handleContentLayoutLint(
  res: import("node:http").ServerResponse,
  body: unknown
): Promise<void> {
  const resolver = getSkillsResolver();
  try {
    const report = await runLayoutLint(resolver);
    send(res, 200, { ok: report.ok, errors: report.errors });
  } catch (e) {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "LAYOUT_LINT_ERROR");
  }
}

async function handler(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse
): Promise<void> {
  const method = req.method ?? "GET";
  const pathStr = req.url?.split("?")[0] ?? "/";
  const { segments, name, id } = parsePath(pathStr);

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key",
    });
    res.end();
    return;
  }

  if (pathStr === "/health" && method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json", ...CORS });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  const auth = requireAuth(req);
  if (!auth.ok) {
    sendError(res, auth.status, auth.message, "UNAUTHORIZED");
    return;
  }

  if (pathStr === "/" || pathStr === "") {
    send(res, 200, {
      name: "light-skills",
      version: "2.1.0",
      endpoints: {
        "GET /health": "Health check",
        "GET /skills": "List skills with metadata",
        "GET /skills/:name": "Skill details",
        "POST /skills/:name/run": "Run skill (body: { request })",
        "POST /run": "Run skill (body: { skill, request })",
        "POST /optimize/instructions": "Optimize raw or skill instructions",
        "POST /optimize/skill": "Optimize one skill",
        "POST /optimize/batch": "Optimize multiple skills",
        "POST /race/models": "Race models (RaceModelsRequest)",
        "POST /content/sync": "Content sync (returns jobId)",
        "POST /content/index": "Build library index (returns jobId)",
        "POST /content/fixtures": "Run fixtures",
        "POST /content/layout-lint": "Layout lint",
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
      await handleSkillsList(res);
      return;
    }
  }

  if (pathStr === "/run" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleRun(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/optimize/instructions" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleOptimizeInstructions(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/optimize/skill" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleOptimizeSkill(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/optimize/batch" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleOptimizeBatch(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/race/models" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleRaceModels(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/content/sync" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentSync(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/content/index" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentIndex(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/content/fixtures" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentFixtures(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (pathStr === "/content/layout-lint" && method === "POST") {
    try {
      const body = await readJsonBody(req);
      await handleContentLayoutLint(res, body);
    } catch (e) {
      sendError(res, 400, e instanceof Error ? e.message : String(e), "BAD_REQUEST");
    }
    return;
  }

  if (segments[0] === "jobs" && segments.length === 2) {
    const jobId = segments[1]!;
    if (method === "GET" && !pathStr.endsWith("/logs")) {
      const job = getJob(jobId);
      if (!job) {
        sendError(res, 404, "Job not found or expired", "NOT_FOUND");
        return;
      }
      send(res, 200, {
        status: job.status,
        progress: job.progress,
        result: job.result,
        error: job.error,
      });
      return;
    }
    if (method === "GET" && pathStr === `/jobs/${jobId}/logs`) {
      const logs = getJobLogs(jobId);
      if (logs === null) {
        sendError(res, 404, "Job not found or expired", "NOT_FOUND");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain", ...CORS });
      res.end(logs.join(""));
      return;
    }
  }

  send(res, 404, { error: "Not found", path: pathStr });
}

const server = createServer((req, res) => {
  handler(req, res).catch((e) => {
    sendError(res, 500, e instanceof Error ? e.message : String(e), "SERVER_ERROR");
  });
});

server.listen(PORT, () => {
  console.log(`light-skills REST API listening on http://localhost:${PORT}`);
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
