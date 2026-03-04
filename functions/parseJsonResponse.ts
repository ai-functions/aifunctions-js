import type { Client, LlmMode } from "../src/index.js";
import { createClient, getModePreset } from "../src/index.js";
import { callAI } from "./callAI.js";
import { extractFirstJson } from "./jsonHelpers.js";

export type ParseJsonResponseOptions = {
    /** When true and deterministic extraction fails, call LLM to extract JSON from the text. */
    llmFallback?: boolean;
    client?: Client;
    mode?: LlmMode;
    model?: string;
};

export type ParseJsonResponseSuccess = { ok: true; json: unknown };
export type ParseJsonResponseFailure = {
    ok: false;
    errorCode: string;
    message: string;
};
export type ParseJsonResponseResult = ParseJsonResponseSuccess | ParseJsonResponseFailure;

const LLM_FALLBACK_WEAK = `Extract the single JSON object from the text below. Output only that JSON object, nothing else. No markdown, no explanation.`;
const LLM_FALLBACK_NORMAL = `You must extract the single JSON object from the following text. Output only the raw JSON object, with no markdown code fences, no explanation, and no other text.`;

/**
 * Deterministic extraction: finds the first brace-balanced {...} in text and parses it.
 * If that fails and options.llmFallback is true, calls the LLM to extract the JSON from the text,
 * then runs the same extraction on the LLM output.
 *
 * @returns `{ ok: true, json }` with the parsed value, or `{ ok: false, errorCode, message }`.
 */
export async function parseJsonResponse(
    text: string,
    options?: ParseJsonResponseOptions
): Promise<ParseJsonResponseResult> {
    const result = extractFirstJson(text);
    if (result.ok) {
        return { ok: true, json: result.data };
    }
    if (!options?.llmFallback) {
        return {
            ok: false,
            errorCode: result.errorCode,
            message: result.message,
        };
    }
    const client = options.client ?? createClient({ backend: getModePreset(options.mode ?? "normal").backend });
    const mode = options.mode ?? "normal";
    try {
        const res = await callAI<{ jsonText?: string } | unknown>({
            client,
            mode,
            instructions: { weak: LLM_FALLBACK_WEAK, normal: LLM_FALLBACK_NORMAL },
            prompt: text,
            model: options.model,
        });
        const raw = res.raw.text.trim();
        const fallbackResult = extractFirstJson(raw);
        if (fallbackResult.ok) {
            return { ok: true, json: fallbackResult.data };
        }
        return { ok: false, errorCode: fallbackResult.errorCode, message: fallbackResult.message };
    } catch (e) {
        return {
            ok: false,
            errorCode: "LLM_FALLBACK_ERROR",
            message: e instanceof Error ? e.message : String(e),
        };
    }
}
