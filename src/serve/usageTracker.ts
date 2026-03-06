/**
 * Usage tracking wrapper for Client.
 * Intercepts every ask() call and accumulates token counts + latency.
 * Also injects AttributionContext into opts so backends (e.g. OpenRouter) can tag requests.
 * Zero changes to skill functions or the executor — purely an HTTP-layer concern.
 */
import type { Client, AskOptions, AskResult, AttributionContext } from "../core/types.js";
import {
  lookupCostDetailed,
  OPENAI_PRICING_TABLE_VERSION,
  isOpenAiModelSlug,
  type LookupCostResult,
} from "./pricingTable.js";

export type CostEstimateStatus = "available" | "estimated" | "unavailable";
export type CostEstimateConfidence = "high" | "medium" | "low" | "none";
export type CostEstimateReasonCode =
  | "BACKEND_NO_PRICING"
  | "MODEL_PRICING_MISSING"
  | "PRICE_LOOKUP_FAILED"
  | "USAGE_INCOMPLETE"
  | "NOT_COMPUTED";
export type CostEstimateSource =
  | "provider-response"
  | "provider-pricing-registry"
  | "cached-pricing"
  | "heuristic";

export type CostEstimate = {
  amountUsd: number | null;
  status: CostEstimateStatus;
  confidence: CostEstimateConfidence;
  reasonCode?: CostEstimateReasonCode;
  reason?: string;
  source?: CostEstimateSource;
  priceVersion?: string;
};

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
  /** Structured cost status with confidence + reason + source metadata. */
  costEstimate: CostEstimate;
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
  const initialCostEstimate: CostEstimate = {
    amountUsd: null,
    status: "unavailable",
    confidence: "none",
    reasonCode: "NOT_COMPUTED",
    reason: "No model calls have been tracked yet.",
  };
  const acc: TrackedUsage = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    model: null,
    latencyMs: 0,
    callCount: 0,
    estimatedCost: null,
    costEstimate: initialCostEstimate,
    attribution,
  };
  let totalEstimatedCost: number | null = null;
  let hadUnavailableCall = false;
  let hadEstimatedCall = false;
  let sourceMixed = false;
  let trackedSource: CostEstimateSource | undefined;
  let trackedPriceVersion: string | undefined;
  let firstUnavailableReasonCode: CostEstimateReasonCode | undefined;
  let firstUnavailableReason: string | undefined;
  let firstCallStart: number | null = null;
  let lastCallEnd = 0;

  function updateCostAccumulator(callEstimate: CostEstimate): void {
    const amount = callEstimate.amountUsd;
    if (amount !== null) {
      totalEstimatedCost = (totalEstimatedCost ?? 0) + amount;
    }
    if (callEstimate.status === "estimated") hadEstimatedCall = true;
    if (callEstimate.status === "unavailable") {
      hadUnavailableCall = true;
      if (!firstUnavailableReasonCode) {
        firstUnavailableReasonCode = callEstimate.reasonCode;
        firstUnavailableReason = callEstimate.reason;
      }
    }

    if (callEstimate.source) {
      if (!trackedSource) trackedSource = callEstimate.source;
      else if (trackedSource !== callEstimate.source) sourceMixed = true;
    }
    if (callEstimate.priceVersion && !trackedPriceVersion) {
      trackedPriceVersion = callEstimate.priceVersion;
    }

    acc.estimatedCost = totalEstimatedCost;
    acc.costEstimate = buildAggregateCostEstimate();
  }

  function buildAggregateCostEstimate(): CostEstimate {
    const hasAmount = totalEstimatedCost !== null;
    const source = sourceMixed ? undefined : trackedSource;
    const priceVersion = trackedPriceVersion;

    if (!hasAmount) {
      return {
        amountUsd: null,
        status: "unavailable",
        confidence: "none",
        reasonCode: firstUnavailableReasonCode ?? "NOT_COMPUTED",
        reason: firstUnavailableReason ?? "No model calls have been tracked yet.",
        source,
        priceVersion,
      };
    }

    if (hadUnavailableCall) {
      return {
        amountUsd: totalEstimatedCost,
        status: "estimated",
        confidence: "low",
        reasonCode: "USAGE_INCOMPLETE",
        reason: "One or more calls had unavailable pricing; amount is a partial estimate.",
        source,
        priceVersion,
      };
    }

    if (hadEstimatedCall) {
      return {
        amountUsd: totalEstimatedCost,
        status: "estimated",
        confidence: "medium",
        reason: "Estimated from provider pricing registry.",
        source,
        priceVersion,
      };
    }

    return {
      amountUsd: totalEstimatedCost,
      status: "available",
      confidence: "high",
      source,
      priceVersion,
    };
  }

  function buildCallCostEstimate(result: AskResult, promptTokens: number, completionTokens: number): CostEstimate {
    const usageWithCost = result.usage as unknown as { cost?: number };
    if (typeof usageWithCost?.cost === "number") {
      return {
        amountUsd: usageWithCost.cost,
        status: "available",
        confidence: "high",
        source: "provider-response",
      };
    }

    const usageRaw = result.usage as Record<string, unknown> | undefined;
    const hasTokenBreakdown = Boolean(
      usageRaw &&
      (
        typeof usageRaw.prompt_tokens === "number" ||
        typeof usageRaw.completion_tokens === "number" ||
        typeof usageRaw.total_tokens === "number"
      )
    );
    if (!hasTokenBreakdown) {
      return {
        amountUsd: null,
        status: "unavailable",
        confidence: "none",
        reasonCode: "USAGE_INCOMPLETE",
        reason: "Token usage is missing, so cost cannot be computed.",
      };
    }

    const modelForCost = result.model ?? acc.model;
    if (!isOpenAiModelSlug(modelForCost)) {
      return {
        amountUsd: null,
        status: "unavailable",
        confidence: "none",
        reasonCode: "BACKEND_NO_PRICING",
        reason: "Provider did not return cost and this model has no bundled pricing source.",
      };
    }

    let lookup: LookupCostResult;
    try {
      lookup = lookupCostDetailed(modelForCost, promptTokens, completionTokens);
    } catch {
      return {
        amountUsd: null,
        status: "unavailable",
        confidence: "none",
        reasonCode: "PRICE_LOOKUP_FAILED",
        reason: "Pricing lookup failed unexpectedly.",
      };
    }

    if (lookup.amountUsd !== null) {
      return {
        amountUsd: lookup.amountUsd,
        status: "estimated",
        confidence: "medium",
        source: "provider-pricing-registry",
        priceVersion: OPENAI_PRICING_TABLE_VERSION,
        reason: "Estimated using bundled OpenAI pricing table.",
      };
    }

    const reasonByStatus: Record<LookupCostResult["status"], string> = {
      ok: "",
      "model-missing": "No model identifier was returned, so pricing cannot be resolved.",
      "model-not-in-table": "Model pricing is missing from the bundled pricing table.",
      "output-price-missing": "Model output pricing is missing from the bundled pricing table.",
    };

    return {
      amountUsd: null,
      status: "unavailable",
      confidence: "none",
      reasonCode: "MODEL_PRICING_MISSING",
      reason: reasonByStatus[lookup.status],
      source: "provider-pricing-registry",
      priceVersion: OPENAI_PRICING_TABLE_VERSION,
    };
  }

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
      const callEstimate = buildCallCostEstimate(result, callPrompt, callCompletion);
      updateCostAccumulator(callEstimate);
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
  /** Alias for totalTokens (parity with aifunction.dev contract). */
  tokens?: number;
  model: string | null;
  latencyMs: number;
  estimatedCost?: number;
  costEstimate?: CostEstimate;
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
    tokens: tracked.totalTokens,
    model: tracked.model,
    latencyMs: tracked.latencyMs,
  };
  if (tracked.estimatedCost !== null) {
    base.estimatedCost = tracked.estimatedCost;
  }
  base.costEstimate = tracked.costEstimate;
  if (tracked.attribution) {
    base.functionId = tracked.attribution.functionId;
    if (tracked.attribution.projectId !== undefined) base.projectId = tracked.attribution.projectId;
    if (tracked.attribution.traceId !== undefined) base.traceId = tracked.attribution.traceId;
    if (tracked.attribution.tags !== undefined) base.tags = tracked.attribution.tags;
  }
  return base;
}
