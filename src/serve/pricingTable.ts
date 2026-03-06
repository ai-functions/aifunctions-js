/**
 * Static OpenAI pricing lookup for cost estimation.
 * Data: data/openai-cost.json, accurate as of March 5th 2026.
 * Used as fallback when OpenRouter does not return usage.cost directly.
 * Future versions will source pricing from a live API.
 */
import costData from "../../data/openai-cost.json";

type CostEntry = { input: number; cached_input: number | null; output: number | null };
const models = costData.models as Record<string, CostEntry | undefined>;
export const OPENAI_PRICING_TABLE_VERSION = "openai-cost@2026-03-05";

type LookupStatus = "ok" | "model-missing" | "model-not-in-table" | "output-price-missing";

export type LookupCostResult = {
  amountUsd: number | null;
  status: LookupStatus;
};

function toBareModelSlug(modelSlug: string): string {
  return modelSlug.includes("/") ? modelSlug.slice(modelSlug.indexOf("/") + 1) : modelSlug;
}

export function isOpenAiModelSlug(modelSlug: string | null | undefined): boolean {
  if (!modelSlug) return false;
  const lower = modelSlug.toLowerCase();
  if (lower.startsWith("openai/")) return true;
  if (lower.includes("/")) return false;
  return /^(gpt|o\d|codex)/.test(lower);
}

/**
 * Estimate cost in USD for a call.
 * Strips vendor prefix (e.g. "openai/") before lookup so both
 * bare slugs ("gpt-5.2") and OpenRouter slugs ("openai/gpt-5.2") resolve.
 * Returns null when the model is not in the table or tokens are missing.
 */
export function lookupCostDetailed(
  modelSlug: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): LookupCostResult {
  if (!modelSlug) return { amountUsd: null, status: "model-missing" };
  const bare = toBareModelSlug(modelSlug);
  const entry = models[bare];
  if (!entry) return { amountUsd: null, status: "model-not-in-table" };
  if (entry.output == null) return { amountUsd: null, status: "output-price-missing" };
  return {
    amountUsd: (promptTokens * entry.input + completionTokens * entry.output) / 1_000_000,
    status: "ok",
  };
}

export function lookupCost(
  modelSlug: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number | null {
  return lookupCostDetailed(modelSlug, promptTokens, completionTokens).amountUsd;
}
