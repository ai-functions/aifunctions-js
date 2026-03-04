/**
 * Shared JSON pipeline: runCompletion → extractFirstJsonObject → safeJsonParse (inside extract) → validateJson.
 * Deterministic 3-step retry: attempt 1 normal, attempt 2 JSON-only guard, attempt 3 fix-to-schema + validation errors in prompt.
 */
import type { ContentResolver } from "nx-content";
import {
  type AiJsonError,
  type AiJsonResult,
  type AiJsonSuccess,
  ERR_JSON_PARSE,
  ERR_NO_JSON_FOUND,
  ERR_SCHEMA_INVALID,
} from "../aiJsonTypes.js";
import { extractFirstJsonObject, NoJsonFoundError } from "../jsonHelpers.js";
import { JsonParseError } from "../safeJsonParse.js";
import { validateJson } from "../validate/validateJson.js";

const RETRY_SYSTEM_JSON_ONLY = "Return ONLY a JSON object. No explanations or markdown.";
const RETRY_SYSTEM_FIX_SCHEMA = "Fix the output to match the required JSON schema. Return ONLY valid JSON.";

export type RunCompletionFn = (opts: {
  systemSuffix?: string;
  promptSuffix?: string;
}) => Promise<{ text: string; usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }; model?: string }>;

export type JsonPipelineOptions = {
  runCompletion: RunCompletionFn;
  /** When provided, validate parsed output against this schema. */
  schema?: object;
  /** Content key to load schema (e.g. "functions/validate/schemas/foo.json"); used when resolver is set. */
  schemaKey?: string;
  /** Skill id to resolve schema from library index (io.output); used when resolver is set. */
  skillId?: string;
  resolver?: ContentResolver;
  throwOnError?: boolean;
};

function toAiJsonError(
  errorCode: AiJsonError["errorCode"],
  message: string,
  attemptsUsed: number,
  rawText: string,
  details?: unknown
): AiJsonError {
  return {
    ok: false,
    errorCode,
    message,
    attemptsUsed,
    rawText,
    details,
  };
}

/**
 * Run the JSON pipeline with up to 3 attempts. Returns AiJsonSuccess or AiJsonError (or throws if throwOnError).
 */
export async function runJsonPipeline<T = unknown>(options: JsonPipelineOptions): Promise<AiJsonResult<T>> {
  const { runCompletion, schema, schemaKey, skillId, resolver, throwOnError = false } = options;
  const hasSchema = !!(schema || schemaKey || (skillId && resolver));
  const schemaId = schemaKey ?? skillId ?? "";

  let lastError: AiJsonError | null = null;
  let lastValidationErrors: Array<{ path: string; message: string }> = [];

  for (let attempt = 1; attempt <= 3; attempt++) {
    const systemSuffix =
      attempt === 1 ? undefined : attempt === 2 ? RETRY_SYSTEM_JSON_ONLY : RETRY_SYSTEM_FIX_SCHEMA;
    const promptSuffix =
      attempt === 3 && lastValidationErrors.length
        ? `\n\nValidation errors to fix:\n${lastValidationErrors.map((e) => `- ${e.path}: ${e.message}`).join("\n")}`
        : undefined;

    const { text, usage, model } = await runCompletion({ systemSuffix, promptSuffix });
    const rawText = text?.trim() ?? "";

    let parsed: unknown;
    try {
      const extracted = extractFirstJsonObject(rawText);
      parsed = extracted.parsed;
    } catch (e) {
      const code = e instanceof NoJsonFoundError ? ERR_NO_JSON_FOUND : e instanceof JsonParseError ? ERR_JSON_PARSE : ERR_NO_JSON_FOUND;
      const message = e instanceof Error ? e.message : String(e);
      lastError = toAiJsonError(code, message, attempt, rawText);
      continue;
    }

    if (hasSchema) {
      const validation = await validateJson(schemaId, parsed, { resolver, schema });
      if (!validation.ok) {
        lastValidationErrors = validation.errors;
        lastError = toAiJsonError(ERR_SCHEMA_INVALID, "Schema validation failed", attempt, rawText, validation.errors);
        continue;
      }
      const success: AiJsonSuccess<T> = {
        ok: true,
        parsed: parsed as T,
        rawText,
        usage,
        model,
        attemptsUsed: attempt,
        validation: { ok: true },
      };
      return success;
    }

    const success: AiJsonSuccess<T> = {
      ok: true,
      parsed: parsed as T,
      rawText,
      usage,
      model,
      attemptsUsed: attempt,
    };
    return success;
  }

  if (throwOnError && lastError) {
    const err = new Error(lastError.message);
    (err as Error & { code?: string; rawText?: string; attemptsUsed?: number }).code = lastError.errorCode;
    (err as Error & { rawText?: string }).rawText = lastError.rawText;
    (err as Error & { attemptsUsed?: number }).attemptsUsed = lastError.attemptsUsed;
    throw err;
  }
  return lastError!;
}
