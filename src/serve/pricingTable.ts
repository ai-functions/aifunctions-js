/**
 * Static OpenAI pricing lookup for cost estimation.
 * Data: data/openai-cost.json, accurate as of March 5th 2026.
 * Used as fallback when OpenRouter does not return usage.cost directly.
 * Future versions will source pricing from a live API.
 */
import costData from "../../data/openai-cost.json";

type CostEntry = { input: number; cached_input: number | null; output: number | null };
const models = costData.models as Record<string, CostEntry | undefined>;

/**
 * Estimate cost in USD for a call.
 * Strips vendor prefix (e.g. "openai/") before lookup so both
 * bare slugs ("gpt-5.2") and OpenRouter slugs ("openai/gpt-5.2") resolve.
 * Returns null when the model is not in the table or tokens are missing.
 */
export function lookupCost(
  modelSlug: string | null | undefined,
  promptTokens: number,
  completionTokens: number
): number | null {
  if (!modelSlug) return null;
  const bare = modelSlug.includes("/") ? modelSlug.slice(modelSlug.indexOf("/") + 1) : modelSlug;
  const entry = models[bare];
  if (!entry || entry.output == null) return null;
  return (promptTokens * entry.input + completionTokens * entry.output) / 1_000_000;
}
