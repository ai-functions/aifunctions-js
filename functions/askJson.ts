import type { Client, LlmMode } from "../src/index.js";
import { createClient, getModePreset } from "../src/index.js";
import type { AiJsonResult } from "./aiJsonTypes.js";
import type { CallAIResult } from "./callAI.js";
import { runJsonPipeline } from "./core/jsonPipeline.js";
import type { ContentResolver } from "nx-content";

export interface AskJsonParams<T = unknown> {
  prompt: string;
  instructions: {
    weak: string;
    normal: string;
    strong?: string;
  };
  outputContract?: string;
  requiredOutputShape?: string;
  client?: Client;
  mode?: LlmMode;
  model?: string;
  schema?: object;
  schemaKey?: string;
  resolver?: ContentResolver;
  /** When true, throw on error instead of returning AiJsonError. Default false. */
  throwOnError?: boolean;
}

const SINGLE_JSON_WEAK =
  "Return JSON ONLY: one JSON object. First char { last char }. If impossible, return {\"error\":\"cannot_complete\",\"reason\":\"...\"}.";
const SINGLE_JSON_NORMAL =
  "You are ai.askJson. Return EXACTLY ONE valid JSON object. No markdown, no code fences, no extra text. Do not invent fields unless asked.";

/**
 * LLM call with single-JSON guarantee. Uses shared pipeline (extractFirstJsonObject → safeJsonParse → optional validateJson) with retries.
 * @returns AiJsonSuccess<T> | AiJsonError (or throws if throwOnError)
 */
export async function askJson<T = unknown>(params: AskJsonParams<T>): Promise<AiJsonResult<T>> {
  const {
    prompt,
    instructions,
    outputContract,
    requiredOutputShape,
    client: providedClient,
    mode = "normal",
    model,
    schema,
    schemaKey,
    resolver,
    throwOnError,
  } = params;

  const singleJsonWeak = SINGLE_JSON_WEAK + (outputContract ? ` ${outputContract}` : "");
  const singleJsonNormal =
    SINGLE_JSON_NORMAL +
    (outputContract ? ` Output must satisfy: ${outputContract}` : "") +
    (requiredOutputShape ? ` Shape: ${requiredOutputShape}` : "");

  const combinedInstructions = {
    weak: `${instructions.weak}\n\n${singleJsonWeak}`.trim(),
    normal: `${instructions.normal}\n\n${singleJsonNormal}`.trim(),
    strong: instructions.strong ? `${instructions.strong}\n\n${singleJsonNormal}`.trim() : undefined,
  };

  const preset = getModePreset(mode);
  const client = providedClient ?? createClient({ backend: preset.backend });
  const chosenInstruction =
    mode === "weak"
      ? combinedInstructions.weak
      : mode === "strong" || mode === "ultra"
        ? (combinedInstructions.strong ?? combinedInstructions.normal)
        : combinedInstructions.normal;

  const opts = {
    system: chosenInstruction,
    model: model ?? (preset.backend === "openrouter" ? preset.model : undefined),
    maxTokens: preset.maxTokens,
    temperature: preset.temperature,
  };

  const runCompletion = async (attemptOpts: { systemSuffix?: string; promptSuffix?: string }) => {
    const system = [opts.system, attemptOpts.systemSuffix].filter(Boolean).join("\n\n");
    const userPrompt = prompt + (attemptOpts.promptSuffix ?? "");
    const res = await client.ask(userPrompt, { ...opts, system });
    return {
      text: res.text?.trim() ?? "",
      usage: res.usage,
      model: res.model,
    };
  };

  return runJsonPipeline<T>({
    runCompletion,
    schema,
    schemaKey,
    resolver,
    throwOnError,
  });
}

/**
 * Helper: convert AiJsonSuccess to CallAIResult for backward compatibility.
 */
export function toCallAIResult<T>(result: AiJsonResult<T>): CallAIResult<T> {
  if (result.ok === false) {
    throw new Error(`${result.errorCode}: ${result.message}`);
  }
  return {
    data: result.parsed,
    usage: result.usage
      ? {
          promptTokens: result.usage.prompt_tokens,
          completionTokens: result.usage.completion_tokens,
          totalTokens: result.usage.total_tokens,
        }
      : { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    raw: {
      text: result.rawText,
      usage: result.usage ?? { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      model: result.model,
    },
  } as CallAIResult<T>;
}
