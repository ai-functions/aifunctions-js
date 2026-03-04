/**
 * Run a completion and return the first parsed JSON in the response.
 * Uses shared pipeline: extractFirstJsonObject → safeJsonParse → optional validateJson.
 * Deterministic retry: attempt 1 normal, 2 JSON-only guard, 3 fix-to-schema.
 * Returns AiJsonSuccess | AiJsonError (or throws if throwOnError).
 */
import type { ContentResolver } from "nx-content";
import type { Client } from "../src/index.js";
import { createClient, getModePreset } from "../src/index.js";
import type { AiJsonResult } from "./aiJsonTypes.js";
import { runJsonPipeline } from "./core/jsonPipeline.js";

export type RunJsonCompletionOptions = {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  vendor?: string | string[];
  system?: string;
  timeoutMs?: number;
  client?: Client;
  /** Validate parsed output against this schema (Ajv). */
  schema?: object;
  /** Content key or skill id to load schema when resolver is set. */
  schemaKey?: string;
  resolver?: ContentResolver;
  /** When true, throw on error instead of returning AiJsonError. Default false. */
  throwOnError?: boolean;
};

/**
 * Execute a completion and return structured result with parsed JSON (or error).
 * Uses extractFirstJsonObject (fenced blocks + extract-first-json) and safeJsonParse.
 */
export async function runJsonCompletion(params: {
  instruction: string;
  options?: RunJsonCompletionOptions;
}): Promise<AiJsonResult<unknown>> {
  const { instruction, options } = params;
  const preset = getModePreset("normal");
  const client = options?.client ?? createClient({ backend: preset.backend });
  const opts = {
    maxTokens: options?.maxTokens ?? preset.maxTokens,
    temperature: options?.temperature ?? preset.temperature,
    model: options?.model ?? preset.model,
    vendor: options?.vendor,
    system: options?.system,
    timeoutMs: options?.timeoutMs,
  };

  const runCompletion = async (attemptOpts: { systemSuffix?: string; promptSuffix?: string }) => {
    const system = [opts.system, attemptOpts.systemSuffix].filter(Boolean).join("\n\n");
    const inst = instruction + (attemptOpts.promptSuffix ?? "");
    const res = await client.ask(inst, { ...opts, system });
    return {
      text: res.text?.trim() ?? "",
      usage: res.usage,
      model: res.model,
    };
  };

  return runJsonPipeline({
    runCompletion,
    schema: options?.schema,
    schemaKey: options?.schemaKey,
    resolver: options?.resolver,
    throwOnError: options?.throwOnError,
  });
}
