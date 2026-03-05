/**
 * Upstream analytics proxy for OpenAI organization-level usage and cost APIs.
 * Requires an admin-scoped API key (OPENAI_ADMIN_KEY env var) — standard project
 * keys do not have access to organization usage endpoints.
 *
 * OpenAI Admin API reference:
 *   GET /v1/organization/usage/completions
 *   GET /v1/organization/costs
 */

const OPENAI_BASE = "https://api.openai.com/v1";

export type OpenAIUsageParams = {
  /**
   * Start of the time range as a Unix timestamp (seconds).
   * Required by the OpenAI API.
   */
  startTime: number;
  /** End of the time range as a Unix timestamp (seconds). Defaults to now. */
  endTime?: number;
  /**
   * Dimensions to group results by.
   * Supported values: "project_id", "user_id", "api_key_id", "model", "batch"
   */
  groupBy?: string[];
  /** Filter by specific project IDs. */
  projectIds?: string[];
  /** Filter by specific model slugs (e.g. "gpt-5-nano"). */
  models?: string[];
  /** Maximum number of result buckets to return. */
  limit?: number;
};

export type OpenAIUsageResult = {
  /** Usage buckets returned by OpenAI. Each bucket covers one time interval. */
  buckets: unknown[];
  /** Whether there are more pages of results. */
  hasMore: boolean;
  /** Raw response data from OpenAI. */
  raw: unknown;
};

export type OpenAICostsParams = {
  /**
   * Start of the time range as a Unix timestamp (seconds).
   * Required by the OpenAI API.
   */
  startTime: number;
  /** End of the time range as a Unix timestamp (seconds). Defaults to now. */
  endTime?: number;
  /**
   * Dimensions to group results by.
   * Supported values: "project_id", "line_item"
   */
  groupBy?: string[];
  /** Filter by specific project IDs. */
  projectIds?: string[];
  /** Maximum number of result buckets to return. */
  limit?: number;
};

export type OpenAICostsResult = {
  /** Cost buckets returned by OpenAI. Each bucket covers one time interval. */
  buckets: unknown[];
  /** Whether there are more pages of results. */
  hasMore: boolean;
  /** Raw response data from OpenAI. */
  raw: unknown;
};

function getAdminKey(): string {
  const key = process.env.OPENAI_ADMIN_KEY?.trim();
  if (!key) {
    throw new Error(
      "OPENAI_ADMIN_KEY environment variable is required for OpenAI analytics endpoints. " +
      "Set it to an admin-scoped OpenAI API key."
    );
  }
  return key;
}

/**
 * Fetch completion token usage from the OpenAI organization usage API.
 * Results are grouped into time buckets and can be further segmented by
 * project, model, user, or API key.
 */
export async function fetchOpenAIUsage(params: OpenAIUsageParams): Promise<OpenAIUsageResult> {
  const adminKey = getAdminKey();
  const qs = new URLSearchParams();
  qs.set("start_time", String(params.startTime));
  if (params.endTime !== undefined) qs.set("end_time", String(params.endTime));
  if (params.groupBy?.length) {
    for (const g of params.groupBy) qs.append("group_by", g);
  }
  if (params.projectIds?.length) {
    for (const p of params.projectIds) qs.append("project_ids", p);
  }
  if (params.models?.length) {
    for (const m of params.models) qs.append("models", m);
  }
  if (params.limit !== undefined) qs.set("limit", String(params.limit));

  const url = `${OPENAI_BASE}/organization/usage/completions?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI usage API failed: ${res.status} ${res.statusText} — ${text}`);
  }
  const raw = await res.json() as { data?: unknown[]; has_more?: boolean };
  return {
    buckets: Array.isArray(raw?.data) ? raw.data : [],
    hasMore: raw?.has_more === true,
    raw,
  };
}

/**
 * Fetch cost data from the OpenAI organization costs API.
 * Returns cost broken down by time bucket, optionally grouped by project or line item.
 */
export async function fetchOpenAICosts(params: OpenAICostsParams): Promise<OpenAICostsResult> {
  const adminKey = getAdminKey();
  const qs = new URLSearchParams();
  qs.set("start_time", String(params.startTime));
  if (params.endTime !== undefined) qs.set("end_time", String(params.endTime));
  if (params.groupBy?.length) {
    for (const g of params.groupBy) qs.append("group_by", g);
  }
  if (params.projectIds?.length) {
    for (const p of params.projectIds) qs.append("project_ids", p);
  }
  if (params.limit !== undefined) qs.set("limit", String(params.limit));

  const url = `${OPENAI_BASE}/organization/costs?${qs.toString()}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${adminKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OpenAI costs API failed: ${res.status} ${res.statusText} — ${text}`);
  }
  const raw = await res.json() as { data?: unknown[]; has_more?: boolean };
  return {
    buckets: Array.isArray(raw?.data) ? raw.data : [],
    hasMore: raw?.has_more === true,
    raw,
  };
}
