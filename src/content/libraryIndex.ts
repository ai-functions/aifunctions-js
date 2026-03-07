/**
 * Library index v1: read/write/validate a structured JSON index of all skills for discovery and automation.
 * See docs/skills-index.v1.md and docs/skills-index.schema.v1.json.
 */
import type { ContentResolver } from "nx-content";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Client } from "../core/types.js";
import { getBuiltInAbilityManifest } from "../../functions/builtinManifest.js";
import type { BuiltInAbilityEntry } from "../../functions/builtinManifest.js";

const DEFAULT_INDEX_KEY = "functions/index.v1.json";
/** Path relative to process.cwd() for fallback when content has no index. */
export const LIBRARY_INDEX_FALLBACK_REL = ".docs/library-index.fallback.json";
const INDEX_PREFIX = "functions/index/v1/";
const META_KEY = "functions/index/v1/_meta.json";
const CONTENT_PREFIX = "functions/";

export type SourceFileKind = "instructions" | "rules" | "prompt" | "other";

export type SourceFile = { key: string; kind: SourceFileKind };

export type SkillSource = {
  contentPrefix?: string;
  files: SourceFile[];
  contentHash: string;
};

export type BuiltInSkillSource = {
  kind: "built-in";
};

export type SkillRuntime = {
  callName: string;
  modes?: ("weak" | "normal" | "strong")[];
  defaults?: Record<string, unknown>;
};

export type RestrictedJsonSchemaObject = {
  type: "object";
  additionalProperties?: boolean;
  properties: Record<string, unknown>;
  required?: string[];
  [k: string]: unknown;
};

export type SkillIO = {
  input: RestrictedJsonSchemaObject;
  output: RestrictedJsonSchemaObject;
};

export type SkillQualityMethod = "not-judged" | "static" | "llm-inferred" | "judged";

export type SkillQuality = {
  confidence: number | null;
  method: SkillQualityMethod;
  notes: string[];
  judgedAt?: string;
  judgeScore?: number;
};

export type SkillIndexEntry = {
  schemaVersion: string;
  /** Public-facing canonical kind for an ability. */
  displayKind?: "function";
  id: string;
  displayName: string;
  description: string;
  source: SkillSource | BuiltInSkillSource;
  runtime: SkillRuntime;
  io: SkillIO;
  examples?: Array<{ input: Record<string, unknown>; output: Record<string, unknown> }>;
  tags?: string[];
  quality: SkillQuality;
};

export type AggregateIndex = {
  schemaVersion: string;
  generatedAt: string;
  generator?: { name?: string; mode?: string; model?: string };
  skills: Array<{ $refKey: string }>;
};

export type IndexMeta = {
  schemaVersion: string;
  generatedAt: string;
  stats: {
    skillsTotal: number;
    skillsUpdated: number;
    skillsUnchanged: number;
    skillsErrored: number;
  };
  errors: Array<{ skillId: string; reason: string; lastGoodRefKey?: string }>;
};

export type GetLibraryIndexOptions = {
  resolver: ContentResolver;
  key?: string;
  /** If true, return empty structure when index is missing; otherwise throw. */
  allowMissing?: boolean;
  /** When allowMissing and resolver has no index, try this path (relative to cwd). Omit to use LIBRARY_INDEX_FALLBACK_REL. */
  fallbackPath?: string | null;
};

export type UpdateLibraryIndexOptions = {
  resolver: ContentResolver;
  prefix?: string;
  indexKey?: string;
  mode?: "weak" | "normal" | "strong";
  model?: string;
  /** If true, do not write; return report with would-be changes. */
  dryRun?: boolean;
  /** If true, skip skills whose contentHash matches existing entry. */
  incremental?: boolean;
  /** Overwrite index even when result would be empty/partial (e.g. all skills errored). */
  force?: boolean;
  /** When true, skip LLM and build index from content only (static entries). Ensures library is always generated for visibility. */
  staticOnly?: boolean;
  /** When true (default), merge built-in abilities into the generated index. */
  includeBuiltIn?: boolean;
  /** When true, run post-index quality judge and persist judged confidence where possible. */
  judgeAfterIndex?: boolean;
  /** Optional client used when judgeAfterIndex=true. */
  client?: Client;
};

export type UpdateLibraryIndexReport = {
  generatedAt: string;
  dryRun: boolean;
  stats: { skillsTotal: number; skillsUpdated: number; skillsUnchanged: number; skillsErrored: number };
  errors: Array<{ skillId: string; reason: string }>;
  refKeys: string[];
};

export type ValidationResult = { valid: boolean; errors?: string[] };

/** Canonical: only folder-based keys functions/<functionId>/<file>. */
function skillNameFromKey(key: string): string | null {
  const normalized = key.replace(/\\/g, "/").trim();
  if (!normalized.startsWith(CONTENT_PREFIX)) return null;
  const parts = normalized.slice(CONTENT_PREFIX.length).split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[0] || null;
}

function fileKindForKey(key: string): SourceFileKind {
  const k = key.replace(/\\/g, "/").toLowerCase();
  if (/\/weak$|\/normal$|\/strong$|\/ultra$/.test(k) || k.endsWith(".md")) return "instructions";
  if (k.endsWith("/rules") || k.endsWith(".json")) return "rules";
  if (k.includes("task") || k.includes("prompt")) return "prompt";
  return "other";
}

function groupKeysBySkill(keys: string[]): Map<string, string[]> {
  const bySkill = new Map<string, string[]>();
  for (const key of keys) {
    const name = skillNameFromKey(key);
    if (!name) continue;
    if (key.includes("/index/") || key.includes("index.v1")) continue;
    let list = bySkill.get(name);
    if (!list) {
      list = [];
      bySkill.set(name, list);
    }
    list.push(key);
  }
  for (const list of bySkill.values()) list.sort();
  return bySkill;
}

/** Minimal restricted JSON Schema for input/output when no LLM-derived schema is available. */
const MINIMAL_IO_SCHEMA: RestrictedJsonSchemaObject = {
  type: "object",
  additionalProperties: false,
  properties: {},
  required: [],
};

function asContentSource(source: SkillIndexEntry["source"]): SkillSource | null {
  if ("kind" in source && source.kind === "built-in") return null;
  return source as SkillSource;
}

export function getBuiltInAbilityEntries(): SkillIndexEntry[] {
  const manifest = getBuiltInAbilityManifest();
  return manifest.map((entry: BuiltInAbilityEntry) => ({
    schemaVersion: "1.0",
    displayKind: "function",
    id: entry.id,
    displayName: entry.displayName,
    description: entry.description,
    source: { kind: "built-in" },
    runtime: {
      callName: entry.runtime.callName,
      modes: entry.runtime.modes,
      defaults: entry.runtime.defaults,
    },
    io: {
      input: entry.io.input,
      output: entry.io.output,
    },
    examples: entry.examples,
    tags: entry.tags,
    quality: {
      confidence: entry.quality.confidence,
      method: entry.quality.method,
      notes: entry.quality.notes,
    },
  }));
}

/**
 * Build a valid index entry from content only (no LLM). Used so the shared library
 * is always generated for visibility and usability of functions, then optionally
 * enriched later via LLM.
 */
function buildStaticIndexEntry(
  skillId: string,
  files: SourceFile[],
  contentHashVal: string,
  concatenatedContent: string
): SkillIndexEntry {
  const displayName = skillId.charAt(0).toUpperCase() + skillId.slice(1).replace(/([A-Z])/g, " $1").trim();
  let description = (concatenatedContent || "").trim().split(/\n+/).find((l) => l.trim().length > 0) || "";
  description = description.replace(/^#+\s*/, "").trim().slice(0, 240) || `Skill: ${skillId}`;
  return {
    schemaVersion: "1.0",
    displayKind: "function",
    id: skillId,
    displayName,
    description,
    source: {
      contentPrefix: CONTENT_PREFIX,
      files,
      contentHash: contentHashVal,
    },
    runtime: {
      callName: skillId,
      modes: ["weak", "normal", "strong"],
      defaults: { mode: "normal", temperature: 0.2, maxTokens: 1200 },
    },
    io: {
      input: MINIMAL_IO_SCHEMA,
      output: MINIMAL_IO_SCHEMA,
    },
    examples: [],
    tags: [],
    quality: {
      confidence: null,
      method: "static",
      notes: ["Static index; run with LLM (content:index) to enrich description and I/O schema"],
    },
  };
}

async function getContent(resolver: ContentResolver, key: string): Promise<string> {
  try {
    const raw = await resolver.get(key);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

function contentHash(contents: string): string {
  const h = createHash("sha256").update(contents, "utf8").digest("hex");
  return "sha256:" + h;
}

function isRestrictedSchema(obj: unknown): obj is RestrictedJsonSchemaObject {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (o.type !== "object") return false;
  if (typeof o.properties !== "object" || o.properties === null) return false;
  return true;
}

export function validateSkillIndexEntry(entry: unknown): ValidationResult {
  const err: string[] = [];
  if (typeof entry !== "object" || entry === null) {
    return { valid: false, errors: ["Entry must be an object"] };
  }
  const e = entry as Record<string, unknown>;
  if (e.schemaVersion !== "1.0") err.push("schemaVersion must be '1.0'");
  if (e.displayKind !== undefined && e.displayKind !== "function") err.push("displayKind, when provided, must be 'function'");
  if (typeof e.id !== "string" || !e.id) err.push("id is required and must be non-empty string");
  if (typeof e.displayName !== "string" || !e.displayName) err.push("displayName is required");
  if (typeof e.description !== "string" || !e.description) err.push("description is required");
  if (!e.source || typeof e.source !== "object") err.push("source is required");
  else {
    const s = e.source as Record<string, unknown>;
    if (s.kind === "built-in") {
      // built-in source shape is valid
    } else {
      if (!Array.isArray(s.files)) err.push("source.files must be an array");
      if (typeof (s as { contentHash?: string }).contentHash !== "string" || !(s as { contentHash: string }).contentHash.startsWith("sha256:"))
        err.push("source.contentHash must be 'sha256:...'");
    }
  }
  if (!e.runtime || typeof e.runtime !== "object") err.push("runtime is required");
  else if (typeof (e.runtime as { callName?: string }).callName !== "string")
    err.push("runtime.callName is required");
  if (!e.io || typeof e.io !== "object") err.push("io is required");
  else {
    const io = e.io as { input?: unknown; output?: unknown };
    if (!isRestrictedSchema(io.input)) err.push("io.input must be a restricted JSON Schema object");
    if (!isRestrictedSchema(io.output)) err.push("io.output must be a restricted JSON Schema object");
  }
  if (!e.quality || typeof e.quality !== "object") err.push("quality is required");
  else {
    const q = e.quality as { confidence?: unknown; method?: unknown };
    if (q.confidence !== null && (typeof q.confidence !== "number" || q.confidence < 0 || q.confidence > 1))
      err.push("quality.confidence must be null or number 0..1");
    if (
      q.method !== "not-judged" &&
      q.method !== "static" &&
      q.method !== "llm-inferred" &&
      q.method !== "judged"
    ) {
      err.push("quality.method must be one of: not-judged, static, llm-inferred, judged");
    }
  }
  return err.length ? { valid: false, errors: err } : { valid: true };
}

export function validateLibraryIndex(index: unknown): ValidationResult {
  if (typeof index !== "object" || index === null)
    return { valid: false, errors: ["Index must be an object"] };
  const i = index as Record<string, unknown>;
  if (i.schemaVersion !== "1.0") return { valid: false, errors: ["schemaVersion must be '1.0'"] };
  if (!Array.isArray(i.skills)) return { valid: false, errors: ["skills must be an array"] };
  const err: string[] = [];
  for (const s of i.skills as Array<unknown>) {
    if (typeof s !== "object" || s === null || !("$refKey" in s) || typeof (s as { $refKey: string }).$refKey !== "string")
      err.push("Each skill must be { $refKey: string }");
  }
  return err.length ? { valid: false, errors: err } : { valid: true };
}

/**
 * Read and parse the aggregate library index. Throws if missing unless allowMissing.
 * When allowMissing is true and the resolver has no index, tries the fallback file at
 * options.fallbackPath or LIBRARY_INDEX_FALLBACK_REL (relative to process.cwd()).
 */
export async function getLibraryIndex(
  options: GetLibraryIndexOptions
): Promise<AggregateIndex> {
  const {
    resolver,
    key = DEFAULT_INDEX_KEY,
    allowMissing = false,
    fallbackPath = LIBRARY_INDEX_FALLBACK_REL,
  } = options;
  let text = "";
  try {
    const raw = await resolver.get(key);
    text = typeof raw === "string" ? raw : "";
  } catch {
    if (!allowMissing) throw new Error(`Library index missing at ${key}`);
    return readFallbackOrEmpty(fallbackPath);
  }
  if (text.trim()) {
    const data = JSON.parse(text) as unknown;
    const result = validateLibraryIndex(data);
    if (!result.valid) throw new Error(`Invalid library index: ${result.errors?.join("; ")}`);
    return data as AggregateIndex;
  }
  if (!allowMissing) throw new Error(`Library index is empty at ${key}`);
  return readFallbackOrEmpty(fallbackPath);
}

async function readFallbackOrEmpty(fallbackPath: string | null | undefined): Promise<AggregateIndex> {
  if (fallbackPath === null) return emptyAggregate();
  const tryPath = fallbackPath ?? LIBRARY_INDEX_FALLBACK_REL;
  const absPath = path.isAbsolute(tryPath) ? tryPath : path.join(process.cwd(), tryPath);
  try {
    const text = await readFile(absPath, "utf-8");
    if (!text.trim()) return emptyAggregate();
    const data = JSON.parse(text) as unknown;
    const result = validateLibraryIndex(data);
    if (!result.valid) return emptyAggregate();
    return data as AggregateIndex;
  } catch {
    return emptyAggregate();
  }
}

function emptyAggregate(): AggregateIndex {
  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    skills: [],
  };
}

/**
 * Regenerate the library index: list skills, LLM per skill, validate, write.
 * Returns report; does not overwrite with empty/partial unless force.
 */
export async function updateLibraryIndex(
  options: UpdateLibraryIndexOptions
): Promise<UpdateLibraryIndexReport> {
  const {
    resolver,
    prefix = CONTENT_PREFIX,
    indexKey = DEFAULT_INDEX_KEY,
    mode = "normal",
    model,
    dryRun = false,
    incremental = false,
    force = false,
    staticOnly = false,
    includeBuiltIn = true,
    judgeAfterIndex = false,
    client,
  } = options;

  const report: UpdateLibraryIndexReport = {
    generatedAt: new Date().toISOString(),
    dryRun,
    stats: { skillsTotal: 0, skillsUpdated: 0, skillsUnchanged: 0, skillsErrored: 0 },
    errors: [],
    refKeys: [],
  };

  let keys: string[];
  try {
    keys = await resolver.listKeys(prefix);
  } catch (e) {
    throw new Error(`Content backend unavailable: ${e instanceof Error ? e.message : String(e)}`);
  }

  const bySkill = groupKeysBySkill(keys);
  report.stats.skillsTotal = bySkill.size;
  const existingIndex = await getLibraryIndex({ resolver, key: indexKey, allowMissing: true }).catch(() => emptyAggregate());
  const existingByRef = new Map<string, SkillIndexEntry>();
  for (const ref of existingIndex.skills) {
    try {
      const raw = await resolver.get(ref.$refKey);
      const entry = JSON.parse(typeof raw === "string" ? raw : "{}") as SkillIndexEntry;
      if (entry.id) existingByRef.set(entry.id, entry);
    } catch {
      // ignore
    }
  }

  const refKeys: string[] = [];
  const metaErrors: Array<{ skillId: string; reason: string; lastGoodRefKey?: string }> = [];

  for (const [skillId, keyList] of bySkill) {
    const refKey = `${INDEX_PREFIX}${skillId}.json`;
    const files: SourceFile[] = keyList.map((k) => ({ key: k, kind: fileKindForKey(k) }));
    let contentBlocks: string[] = [];
    for (const k of keyList) {
      const c = await getContent(resolver, k);
      contentBlocks.push(`--- FILE: ${k} (kind=${fileKindForKey(k)})\n${c}`);
    }
    const concatenated = contentBlocks.join("\n\n");
    const hash = contentHash(concatenated);
    const existing = existingByRef.get(skillId);
    const existingSource = existing ? asContentSource(existing.source) : null;
    if (incremental && existingSource?.contentHash === hash) {
      report.stats.skillsUnchanged++;
      refKeys.push(refKey);
      continue;
    }

    if (staticOnly) {
      const staticEntry = buildStaticIndexEntry(skillId, files, hash, concatenated);
      const staticValid = validateSkillIndexEntry(staticEntry);
      if (staticValid.valid) {
        if (!dryRun) await resolver.set(refKey, JSON.stringify(staticEntry, null, 2));
        report.stats.skillsUpdated++;
        refKeys.push(refKey);
      } else {
        report.stats.skillsErrored++;
        report.errors.push({ skillId, reason: "Static entry validation failed" });
        if (existing) refKeys.push(refKey);
      }
      continue;
    }

    const { askJson } = await import("../../functions/askJson.js");
    const system = getIndexerSystemPrompt();
    const user = getIndexerUserPrompt(skillId, skillId, files, concatenated);
    let llmResult: unknown = null;
    let lastError: string | null = null;
    try {
      const res = await askJson<Record<string, unknown>>({
        instructions: { weak: system, normal: system, strong: system },
        prompt: user,
        mode,
        model,
      });
      llmResult = res.ok ? res.parsed : null;
      if (!res.ok) lastError = res.message;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    if (!llmResult || typeof llmResult !== "object") {
      const fallback = await tryFallbackPrompt(askJson as AskJsonFn, skillId, mode, model);
      if (fallback) llmResult = fallback;
    }
    if (!llmResult || typeof llmResult !== "object") {
      // Always produce an index entry for visibility/usability: use static entry when LLM is unavailable
      const staticEntry = buildStaticIndexEntry(skillId, files, hash, concatenated);
      const staticValid = validateSkillIndexEntry(staticEntry);
      if (staticValid.valid) {
        if (!dryRun) await resolver.set(refKey, JSON.stringify(staticEntry, null, 2));
        report.stats.skillsUpdated++;
        refKeys.push(refKey);
        report.errors.push({
          skillId,
          reason: lastError ? `LLM failed (${lastError}); used static entry` : "Used static entry (no LLM)",
        });
      } else {
        report.stats.skillsErrored++;
        report.errors.push({ skillId, reason: lastError || "LLM returned no object" });
        metaErrors.push({ skillId, reason: lastError || "LLM failed", lastGoodRefKey: existing ? refKey : undefined });
        if (existing) refKeys.push(refKey);
      }
      continue;
    }
    const validated = validateLlmOutput(llmResult, skillId);
    if (!validated.valid) {
      const repaired = await tryRepairPrompt(askJson as AskJsonFn, skillId, llmResult, validated.errors ?? [], mode, model);
      if (repaired) {
        const v2 = validateLlmOutput(repaired, skillId);
        if (v2.valid) llmResult = repaired;
      }
    }
    const wrapped = wrapLlmOutput(llmResult as LlmSkillOutput, skillId, files, hash);
    const entryValidation = validateSkillIndexEntry(wrapped);
    if (!entryValidation.valid) {
      const staticEntry = buildStaticIndexEntry(skillId, files, hash, concatenated);
      const staticValid = validateSkillIndexEntry(staticEntry);
      if (staticValid.valid) {
        if (!dryRun) await resolver.set(refKey, JSON.stringify(staticEntry, null, 2));
        report.stats.skillsUpdated++;
        refKeys.push(refKey);
        report.errors.push({
          skillId,
          reason: `LLM output invalid (${entryValidation.errors?.join("; ") ?? "validation failed"}); used static entry`,
        });
      } else {
        report.stats.skillsErrored++;
        report.errors.push({ skillId, reason: entryValidation.errors?.join("; ") ?? "Validation failed" });
        metaErrors.push({ skillId, reason: entryValidation.errors?.join("; ") ?? "", lastGoodRefKey: existing ? refKey : undefined });
        if (existing) refKeys.push(refKey);
      }
      continue;
    }
    if (!dryRun) {
      await resolver.set(refKey, JSON.stringify(wrapped, null, 2));
    }
    report.stats.skillsUpdated++;
    refKeys.push(refKey);
  }

  if (includeBuiltIn) {
    const builtInEntries = getBuiltInAbilityEntries();
    const seenIds = new Set(refKeys.map((key) => key.replace(`${INDEX_PREFIX}`, "").replace(/\.json$/, "")));
    for (const entry of builtInEntries) {
      if (seenIds.has(entry.id)) continue;
      const refKey = `${INDEX_PREFIX}${entry.id}.json`;
      const entryValidation = validateSkillIndexEntry(entry);
      if (!entryValidation.valid) {
        report.stats.skillsErrored++;
        report.errors.push({ skillId: entry.id, reason: entryValidation.errors?.join("; ") ?? "Built-in entry validation failed" });
        continue;
      }
      if (!dryRun) {
        await resolver.set(refKey, JSON.stringify(entry, null, 2));
      }
      report.stats.skillsUpdated++;
      refKeys.push(refKey);
      seenIds.add(entry.id);
    }
  }

  if (judgeAfterIndex && !dryRun) {
    const { judgeV1 } = await import("../../functions/judge/judgeV1.js");
    for (const refKey of refKeys) {
      let parsedEntry: SkillIndexEntry | null = null;
      try {
        const raw = await resolver.get(refKey);
        parsedEntry = JSON.parse(typeof raw === "string" ? raw : "{}") as SkillIndexEntry;
      } catch {
        continue;
      }
      if (!parsedEntry) continue;
      const firstExample = parsedEntry.examples?.[0];
      if (!firstExample) continue;
      try {
        const score = await judgeV1({
          instructions: parsedEntry.description,
          response: JSON.stringify(firstExample.output ?? {}, null, 2),
          rules: [{ rule: "Output must be valid and aligned with declared io.output schema.", weight: 1 }],
          threshold: 0.8,
          mode: "normal",
          client,
        });
        parsedEntry.quality = {
          ...parsedEntry.quality,
          confidence: score.scoreNormalized,
          method: "judged",
          judgedAt: new Date().toISOString(),
          judgeScore: score.scoreNormalized,
          notes: [
            ...(parsedEntry.quality.notes ?? []),
            "Quality confidence updated from judge.v1 score.",
          ],
        };
        await resolver.set(refKey, JSON.stringify(parsedEntry, null, 2));
      } catch (e) {
        if (client) {
          throw new Error(`judgeAfterIndex failed for ${parsedEntry.id}: ${e instanceof Error ? e.message : String(e)}`);
        }
        // Keep original quality if judge fails without an explicit client.
      }
    }
  }

  report.stats.skillsTotal = refKeys.length;
  report.refKeys = refKeys;
  if (!dryRun) {
    const aggregate: AggregateIndex = {
      schemaVersion: "1.0",
      generatedAt: report.generatedAt,
      generator: { name: "light-skills-indexer", mode, model },
      skills: refKeys.map((r) => ({ $refKey: r })),
    };
    const isEmpty = refKeys.length === 0;
    if (isEmpty && !force) {
      // Do not overwrite with empty
    } else {
      await resolver.set(indexKey, JSON.stringify(aggregate, null, 2));
    }
    const meta: IndexMeta = {
      schemaVersion: "1.0",
      generatedAt: report.generatedAt,
      stats: report.stats,
      errors: metaErrors,
    };
    await resolver.set(META_KEY, JSON.stringify(meta, null, 2));
  }
  return report;
}

type LlmSkillOutput = {
  id: string;
  displayName: string;
  description: string;
  io: { input: unknown; output: unknown };
  examples?: Array<{ input: Record<string, unknown>; output: Record<string, unknown> }>;
  tags?: string[];
  quality: { confidence: number; notes: string[] };
};

function validateLlmOutput(obj: unknown, skillId: string): ValidationResult {
  const err: string[] = [];
  if (typeof obj !== "object" || obj === null) return { valid: false, errors: ["Not an object"] };
  const o = obj as Record<string, unknown>;
  if (o.id !== skillId) err.push(`id must be "${skillId}"`);
  if (typeof o.displayName !== "string") err.push("displayName must be string");
  if (typeof o.description !== "string") err.push("description must be string");
  if (!o.io || typeof o.io !== "object") err.push("io required");
  else {
    const io = o.io as { input?: unknown; output?: unknown };
    if (!isRestrictedSchema(io.input)) err.push("io.input must be restricted JSON Schema object");
    if (!isRestrictedSchema(io.output)) err.push("io.output must be restricted JSON Schema object");
  }
  if (!o.quality || typeof o.quality !== "object") err.push("quality required");
  else if (typeof (o.quality as { confidence?: unknown }).confidence !== "number")
    err.push("quality.confidence must be number");
  return err.length ? { valid: false, errors: err } : { valid: true };
}

function wrapLlmOutput(
  llm: LlmSkillOutput,
  skillId: string,
  files: SourceFile[],
  contentHashVal: string
): SkillIndexEntry {
  return {
    schemaVersion: "1.0",
    displayKind: "function",
    id: skillId,
    displayName: llm.displayName ?? skillId,
    description: llm.description ?? "",
    source: {
      contentPrefix: CONTENT_PREFIX,
      files,
      contentHash: contentHashVal,
    },
    runtime: {
      callName: skillId,
      modes: ["weak", "normal", "strong"],
      defaults: { mode: "normal", temperature: 0.2, maxTokens: 1200 },
    },
    io: {
      input: llm.io?.input as RestrictedJsonSchemaObject,
      output: llm.io?.output as RestrictedJsonSchemaObject,
    },
    examples: llm.examples ?? [],
    tags: llm.tags ?? [],
    quality: llm.quality
      ? { confidence: llm.quality.confidence, method: "llm-inferred", notes: llm.quality.notes }
      : { confidence: null, method: "llm-inferred", notes: ["LLM output missing quality metadata."] },
  };
}

const INDEXER_SYSTEM = `You are a strict "Skill Indexer" that extracts metadata for a single skill/function.

HARD RULES:
- Output MUST be a single JSON object only. No markdown. No extra text.
- The JSON MUST match exactly the required output shape described below.
- Do NOT include keys that are not in the schema.
- Prefer short, clear descriptions.
- The IO schema MUST follow the "Restricted JSON Schema v1" subset:
  - Root MUST be { "type":"object", "additionalProperties":false, "properties":{...}, "required":[...] }
  - Allowed keywords:
    - For object: type, additionalProperties, properties, required
    - For primitive props: type, enum, default, description, minLength, maxLength, minimum, maximum
    - For arrays: type="array", items, minItems, maxItems
    - For nested objects: same subset recursively
  - NOT allowed: $ref, oneOf, anyOf, allOf, patternProperties, dependentSchemas, if/then/else.
- If uncertain about a field, keep it minimal and reduce confidence.

OUTPUT SHAPE (EXACT):
{
  "id": string,
  "displayName": string,
  "description": string,
  "io": {
    "input": RestrictedJsonSchemaObject,
    "output": RestrictedJsonSchemaObject
  },
  "examples": [
    { "input": object, "output": object }
  ],
  "tags": string[],
  "quality": {
    "confidence": number (0..1),
    "notes": string[]
  }
}

QUALITY GUIDANCE:
- confidence >= 0.85 only if IO is explicitly stated (or very clear).
- confidence 0.50–0.80 if inferred from strong hints.
- confidence <= 0.45 if mostly guessing; add notes explaining why.

EXAMPLES:
- Keep examples tiny and realistic (1 example is enough).
- If you truly cannot infer a valid example, output an empty array [] and lower confidence.`;

function getIndexerUserPrompt(
  skillId: string,
  callName: string,
  files: SourceFile[],
  contentBlocks: string
): string {
  const fileList = files.map((f) => `- ${f.key} (kind=${f.kind})`).join("\n");
  return `Index ONE skill.

Skill identity:
- skillId: "${skillId}"
- expected callName (may match): "${callName}"

Source files (keys + kinds):
${fileList}

Raw content (verbatim, may include multiple files):
${contentBlocks}

TASK:
Produce the JSON object in the exact output shape.
Rules:
- Set "id" to the provided skillId.
- "displayName" should be short human name (Title Case).
- "description" should be 1–2 sentences, <= 240 chars if possible.
- Input/output schemas must be valid Restricted JSON Schema v1.
- If you see explicit input/output types or params, use them.
- If you don't, infer minimal reasonable IO, but lower confidence and explain in quality.notes.

Return JSON only.`;
}

const REPAIR_SYSTEM = `You are a JSON repair tool.

HARD RULES:
- Output MUST be a single JSON object only. No markdown. No extra text.
- Output MUST match the exact required shape below. Do NOT add keys.
- Fix types, add missing required keys, remove unknown keys.
- Ensure io.input and io.output are valid Restricted JSON Schema v1 objects.

REQUIRED OUTPUT SHAPE (EXACT):
{
  "id": string,
  "displayName": string,
  "description": string,
  "io": {
    "input": RestrictedJsonSchemaObject,
    "output": RestrictedJsonSchemaObject
  },
  "examples": [
    { "input": object, "output": object }
  ],
  "tags": string[],
  "quality": {
    "confidence": number (0..1),
    "notes": string[]
  }
}`;

function getRepairUserPrompt(skillId: string, invalidJson: string, validationErrors: string[]): string {
  return `Fix the following JSON to match the required shape and constraints.

Skill id must be: "${skillId}"

INVALID JSON:
${invalidJson}

VALIDATION ERRORS:
${validationErrors.join("\n")}

Return ONLY the corrected JSON object.`;
}

const FALLBACK_SYSTEM = `You are a strict "Skill Indexer" that may produce a minimal safe contract when information is insufficient.

HARD RULES:
- Output MUST be a single JSON object only.
- Must match exact output shape.
- If uncertain, choose very minimal IO:
  - input: { "type":"object", "additionalProperties":false, "properties": { "text": { "type": "string" } }, "required": ["text"] }
  - output: { "type":"object", "additionalProperties":false, "properties": { "result": { "type": "object" } }, "required": ["result"] }
- Set confidence low and explain why in notes.`;

function getFallbackUserPrompt(skillId: string): string {
  return `Skill id: "${skillId}"

Source content is insufficient or ambiguous.
Produce a minimal valid index entry using the minimal safe IO contract.

Return JSON only.`;
}

type AskJsonFn = (p: {
  instructions: { weak: string; normal: string; strong?: string };
  prompt: string;
  mode?: "weak" | "normal" | "strong";
  model?: string;
}) => Promise<{ ok: true; parsed: unknown } | { ok: false; errorCode: string; message: string; attemptsUsed: number; rawText: string }>;

async function tryRepairPrompt(
  askJsonFn: AskJsonFn,
  skillId: string,
  invalidObj: unknown,
  validationErrors: string[],
  mode: "weak" | "normal" | "strong",
  model?: string
): Promise<unknown> {
  try {
    const res = await askJsonFn({
      instructions: { weak: REPAIR_SYSTEM, normal: REPAIR_SYSTEM, strong: REPAIR_SYSTEM },
      prompt: getRepairUserPrompt(skillId, JSON.stringify(invalidObj), validationErrors),
      mode,
      model,
    });
    return res.ok ? res.parsed : null;
  } catch {
    return null;
  }
}

async function tryFallbackPrompt(
  askJsonFn: AskJsonFn,
  skillId: string,
  mode: "weak" | "normal" | "strong",
  model?: string
): Promise<unknown> {
  try {
    const res = await askJsonFn({
      instructions: { weak: FALLBACK_SYSTEM, normal: FALLBACK_SYSTEM, strong: FALLBACK_SYSTEM },
      prompt: getFallbackUserPrompt(skillId),
      mode,
      model,
    });
    return res.ok ? res.parsed : null;
  } catch {
    return null;
  }
}

function getIndexerSystemPrompt(): string {
  return INDEXER_SYSTEM;
}
