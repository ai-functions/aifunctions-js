/**
 * In-memory append-only activity log for function calls.
 * Used by GET /activity to expose server-side usage with functionId, projectId, attribution.
 */

const MAX_ENTRIES = 50_000;

export type ActivityEntry = {
  id: string;
  functionId: string;
  model: string | null;
  mode?: string;
  projectId?: string;
  traceId?: string;
  tokens: { prompt: number; completion: number; total: number };
  cost: number | null;
  latencyMs: number;
  status: "success" | "error";
  createdAt: string;
};

export type ActivityFilters = {
  from?: string;
  to?: string;
  functionId?: string;
  projectId?: string;
  model?: string;
  limit?: number;
};

export type ActivitySummary = {
  totalCalls: number;
  totalTokens: number;
  totalCost: number;
  byFunction: Record<string, { calls: number; cost: number }>;
  byModel: Record<string, { calls: number; cost: number }>;
};

const log: ActivityEntry[] = [];

function generateId(): string {
  return `act_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Append one activity record. Newest at index 0; list is capped at MAX_ENTRIES.
 */
export function appendActivity(entry: Omit<ActivityEntry, "id" | "createdAt">): void {
  const full: ActivityEntry = {
    ...entry,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  log.unshift(full);
  if (log.length > MAX_ENTRIES) {
    log.length = MAX_ENTRIES;
  }
}

/**
 * Query activities with optional filters. Returns activities (newest first) and summary over the filtered set.
 */
export function queryActivity(filters: ActivityFilters = {}): {
  activities: ActivityEntry[];
  summary: ActivitySummary;
} {
  let list = [...log];
  const from = filters.from ? new Date(filters.from).getTime() : NaN;
  const to = filters.to ? new Date(filters.to).getTime() : NaN;
  if (!Number.isNaN(from)) {
    list = list.filter((a) => new Date(a.createdAt).getTime() >= from);
  }
  if (!Number.isNaN(to)) {
    list = list.filter((a) => new Date(a.createdAt).getTime() <= to);
  }
  if (filters.functionId) {
    list = list.filter((a) => a.functionId === filters.functionId);
  }
  if (filters.projectId) {
    list = list.filter((a) => a.projectId === filters.projectId);
  }
  if (filters.model) {
    list = list.filter((a) => a.model === filters.model);
  }
  const limit = Math.min(1000, Math.max(1, Number(filters.limit) || 100));
  const activities = list.slice(0, limit);

  const totalCalls = list.length;
  let totalTokens = 0;
  let totalCost = 0;
  const byFunction: Record<string, { calls: number; cost: number }> = {};
  const byModel: Record<string, { calls: number; cost: number }> = {};

  for (const a of list) {
    totalTokens += a.tokens.total;
    totalCost += a.cost ?? 0;
    const fn = a.functionId;
    if (!byFunction[fn]) byFunction[fn] = { calls: 0, cost: 0 };
    byFunction[fn].calls += 1;
    byFunction[fn].cost += a.cost ?? 0;
    const m = a.model ?? "unknown";
    if (!byModel[m]) byModel[m] = { calls: 0, cost: 0 };
    byModel[m].calls += 1;
    byModel[m].cost += a.cost ?? 0;
  }

  const summary: ActivitySummary = {
    totalCalls,
    totalTokens,
    totalCost,
    byFunction,
    byModel,
  };

  return { activities, summary };
}
