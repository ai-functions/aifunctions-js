/**
 * Usage tracking wrapper for Client.
 * Intercepts every ask() call and accumulates token counts + latency.
 * Zero changes to skill functions or the executor — purely an HTTP-layer concern.
 */
import type { Client, AskOptions, AskResult } from "../index.js";

export type TrackedUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  /** Last model slug returned by the backend (if any). */
  model: string | null;
  /** Wall-clock time from first ask() call to last ask() call completing (ms). */
  latencyMs: number;
  callCount: number;
};

export type UsageTracker = {
  client: Client;
  getUsage(): TrackedUsage;
};

/**
 * Wrap a Client so every ask() call accumulates usage stats.
 * Pass the returned .client to any skill function (via request.client or options.client).
 * After the call, read accumulated stats via .getUsage().
 */
export function wrapWithUsageTracking(client: Client): UsageTracker {
  const acc: TrackedUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: null,
    latencyMs: 0,
    callCount: 0,
  };
  let firstCallStart: number | null = null;
  let lastCallEnd = 0;

  const wrappedClient: Client = {
    ask: async (instruction: string, opts: AskOptions): Promise<AskResult> => {
      if (firstCallStart === null) firstCallStart = Date.now();
      const result = await client.ask(instruction, opts);
      lastCallEnd = Date.now();
      acc.promptTokens += result.usage?.prompt_tokens ?? 0;
      acc.completionTokens += result.usage?.completion_tokens ?? 0;
      acc.totalTokens += result.usage?.total_tokens ?? 0;
      if (result.model) acc.model = result.model;
      acc.latencyMs = firstCallStart !== null ? lastCallEnd - firstCallStart : 0;
      acc.callCount += 1;
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

/** Serialise TrackedUsage to the contract shape. Returns null if no calls were made. */
export function toUsageResponse(
  tracked: TrackedUsage
): { promptTokens: number; completionTokens: number; totalTokens: number; model: string | null; latencyMs: number } | null {
  if (tracked.callCount === 0) return null;
  return {
    promptTokens: tracked.promptTokens,
    completionTokens: tracked.completionTokens,
    totalTokens: tracked.totalTokens,
    model: tracked.model,
    latencyMs: tracked.latencyMs,
  };
}
