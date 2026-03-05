/**
 * Usage tracking wrapper for Client.
 * Intercepts every ask() call and accumulates token counts + latency.
 * Also injects AttributionContext into opts so backends (e.g. OpenRouter) can tag requests.
 * Zero changes to skill functions or the executor — purely an HTTP-layer concern.
 */
import type { Client, AskOptions, AskResult, AttributionContext } from "../core/types.js";
import { lookupCost } from "./pricingTable.js";

export type TrackedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Last model slug returned by the backend (if any). */
  model: string | null;
  /** Wall-clock time from first ask() call to last ask() call completing (ms). */
  latencyMs: number;
  callCount: number;
  /** Summed cost across all calls in this request (USD). Null when unavailable. */
  estimatedCost: number | null;
  /** Attribution context for this tracked session, if provided. */
  attribution?: AttributionContext;
};

export type UsageTracker = {
  client: Client;
  getUsage(): TrackedUsage;
};

/**
 * Wrap a Client so every ask() call accumulates usage stats.
 * Pass the returned .client to any skill function (via request.client or options.client).
 * After the call, read accumulated stats via .getUsage().
 *
 * When attribution is provided, it is injected into every ask() call's opts so that
 * backends can tag the outgoing request (e.g. OpenRouter user field).
 */
export function wrapWithUsageTracking(client: Client, attribution?: AttributionContext): UsageTracker {
  const acc: TrackedUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: null,
    latencyMs: 0,
    callCount: 0,
    estimatedCost: null,
    attribution,
  };
  let firstCallStart: number | null = null;
  let lastCallEnd = 0;

  const wrappedClient: Client = {
    ask: async (instruction: string, opts: AskOptions): Promise<AskResult> => {
      if (firstCallStart === null) firstCallStart = Date.now();
      const optsWithAttribution: AskOptions = attribution
        ? { ...opts, attribution }
        : opts;
      const result = await client.ask(instruction, optsWithAttribution);
      lastCallEnd = Date.now();
      const callPrompt = result.usage?.prompt_tokens ?? 0;
      const callCompletion = result.usage?.completion_tokens ?? 0;
      acc.promptTokens += callPrompt;
      acc.completionTokens += callCompletion;
      acc.totalTokens += result.usage?.total_tokens ?? callPrompt + callCompletion;
      if (result.model) acc.model = result.model;
      acc.latencyMs = firstCallStart !== null ? lastCallEnd - firstCallStart : 0;
      acc.callCount += 1;
      // Cost: prefer OpenRouter's returned usage.cost, fall back to static table.
      const usageWithCost = result.usage as unknown as { cost?: number };
      const callCost =
        typeof usageWithCost?.cost === "number"
          ? usageWithCost.cost
          : lookupCost(result.model ?? acc.model, callPrompt, callCompletion);
      if (callCost !== null) {
        acc.estimatedCost = (acc.estimatedCost ?? 0) + callCost;
      }
      return result;
    },
    testConnection: () => client.testConnection(),
  };

  if (client.askStream) {
    wrappedClient.askStream = client.askStream.bind(client);
  }

  return {
    client: wrappedClient,
    getUsage: () => ({ ...acc }),
  };
}

export type UsageResponse = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  model: string | null;
  latencyMs: number;
  estimatedCost?: number;
  functionId?: string;
  projectId?: string;
  traceId?: string;
  tags?: Record<string, string>;
};

/** Serialise TrackedUsage to the contract shape. Returns null if no calls were made. */
export function toUsageResponse(tracked: TrackedUsage): UsageResponse | null {
  if (tracked.callCount === 0) return null;
  const base: UsageResponse = {
    promptTokens: tracked.promptTokens,
    completionTokens: tracked.completionTokens,
    totalTokens: tracked.totalTokens,
    model: tracked.model,
    latencyMs: tracked.latencyMs,
  };
  if (tracked.estimatedCost !== null) {
    base.estimatedCost = tracked.estimatedCost;
  }
  if (tracked.attribution) {
    base.functionId = tracked.attribution.functionId;
    if (tracked.attribution.projectId !== undefined) base.projectId = tracked.attribution.projectId;
    if (tracked.attribution.traceId !== undefined) base.traceId = tracked.attribution.traceId;
    if (tracked.attribution.tags !== undefined) base.tags = tracked.attribution.tags;
  }
  return base;
}
