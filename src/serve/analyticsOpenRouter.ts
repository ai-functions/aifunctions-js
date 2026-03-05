/**
 * Upstream analytics proxy for OpenRouter.
 * Fetches generation records and account credit information directly from
 * the OpenRouter API so callers can build dashboards without storing data locally.
 */

const OPENROUTER_BASE = "https://openrouter.ai/api/v1";

export type OpenRouterCredits = {
  /** Remaining credit balance in USD. */
  balance: number;
  /** Total usage in USD over the account's lifetime. */
  usage: number;
  /** Whether the key is valid and active. */
  isActive: boolean;
  /** Raw response data from OpenRouter. */
  raw: unknown;
};

export type OpenRouterGenerationsParams = {
  /** Filter: minimum date (ISO 8601, e.g. "2026-01-01"). */
  dateMin?: string;
  /** Filter: maximum date (ISO 8601). */
  dateMax?: string;
  /** Filter: exact model slug (e.g. "openai/gpt-5-nano"). */
  model?: string;
  /**
   * Filter: user tag in the form "<projectId>:<functionId>" or just "<functionId>".
   * Matches the value injected into the OpenRouter `user` field by this package.
   */
  userTag?: string;
  /** Maximum number of records to return. Defaults to 100. */
  limit?: number;
};

export type OpenRouterGenerationsResult = {
  /** Generation records returned by OpenRouter. */
  generations: unknown[];
  /** Raw response data from OpenRouter. */
  raw: unknown;
};

/**
 * Fetch account credit balance and usage from OpenRouter.
 * Uses the provided API key (BYOK) or falls back to OPENROUTER_API_KEY env var.
 */
export async function fetchOpenRouterCredits(apiKey: string): Promise<OpenRouterCredits> {
  const res = await fetch(`${OPENROUTER_BASE}/auth/key`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter /auth/key failed: ${res.status} ${res.statusText} — ${text}`);
  }
  const raw = await res.json() as {
    data?: {
      label?: string;
      usage?: number;
      limit?: number | null;
      is_free_tier?: boolean;
      rate_limit?: unknown;
    };
  };
  const data = raw?.data ?? {};
  const limit = typeof data.limit === "number" ? data.limit : null;
  const used = typeof data.usage === "number" ? data.usage : 0;
  const balance = limit !== null ? Math.max(0, limit - used) : 0;
  return {
    balance,
    usage: used,
    isActive: true,
    raw,
  };
}

/**
 * Fetch generation records from OpenRouter.
 * Supports filtering by date range, model, and user tag.
 */
export async function fetchOpenRouterGenerations(
  apiKey: string,
  params: OpenRouterGenerationsParams = {}
): Promise<OpenRouterGenerationsResult> {
  const qs = new URLSearchParams();
  if (params.dateMin) qs.set("date_min", params.dateMin);
  if (params.dateMax) qs.set("date_max", params.dateMax);
  if (params.model) qs.set("model", params.model);
  if (params.userTag) qs.set("user", params.userTag);
  qs.set("limit", String(params.limit ?? 100));

  const url = `${OPENROUTER_BASE}/generation?${qs.toString()}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenRouter /generation failed: ${res.status} ${res.statusText} — ${text}`);
  }
  const raw = await res.json() as { data?: unknown[] };
  return {
    generations: Array.isArray(raw?.data) ? raw.data : [],
    raw,
  };
}
