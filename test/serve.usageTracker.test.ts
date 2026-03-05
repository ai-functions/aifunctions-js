/**
 * Unit tests for wrapWithUsageTracking and toUsageResponse (with attribution). Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createClient,
  wrapWithUsageTracking,
  toUsageResponse,
  type AttributionContext,
} from "../dist/src/index.js";

const usage = {
  prompt_tokens: 100,
  completion_tokens: 50,
  total_tokens: 150,
};

describe("wrapWithUsageTracking with attribution", () => {
  const originalFetch = globalThis.fetch;

  const mockFetch = () => {
    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { ...usage, cost: 0.001 },
          model: "openai/gpt-5-nano",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
  };

  const restoreFetch = () => {
    globalThis.fetch = originalFetch;
  };

  it("injects attribution into ask() and toUsageResponse includes attribution fields", async () => {
    mockFetch();
    const base = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    const attribution: AttributionContext = {
      functionId: "extract.requirements",
      projectId: "cognni-prod",
      traceId: "req-983741",
      tags: { workflow: "classification" },
    };
    const tracker = wrapWithUsageTracking(base, attribution);
    await tracker.client.ask("Hello", {
      model: "openai/gpt-5-nano",
      maxTokens: 100,
      temperature: 0.7,
    });
    const response = toUsageResponse(tracker.getUsage());
    restoreFetch();
    assert.ok(response);
    assert.strictEqual(response!.functionId, "extract.requirements");
    assert.strictEqual(response!.projectId, "cognni-prod");
    assert.strictEqual(response!.traceId, "req-983741");
    assert.deepStrictEqual(response!.tags, { workflow: "classification" });
    assert.strictEqual(response!.promptTokens, 100);
    assert.strictEqual(response!.completionTokens, 50);
    assert.strictEqual(response!.totalTokens, 150);
    assert.strictEqual(response!.model, "openai/gpt-5-nano");
    assert.strictEqual(response!.estimatedCost, 0.001);
  });

  it("toUsageResponse returns null when callCount is 0", () => {
    const base = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    const tracker = wrapWithUsageTracking(base, {
      functionId: "optimize.judge",
      traceId: "t1",
    });
    const response = toUsageResponse(tracker.getUsage());
    assert.strictEqual(response, null);
  });

  it("toUsageResponse without attribution omits functionId, projectId, traceId, tags", async () => {
    mockFetch();
    const base = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    const tracker = wrapWithUsageTracking(base);
    await tracker.client.ask("Hi", {
      model: "openai/gpt-5-nano",
      maxTokens: 50,
      temperature: 0.5,
    });
    const response = toUsageResponse(tracker.getUsage());
    restoreFetch();
    assert.ok(response);
    assert.strictEqual("functionId" in response! ? response.functionId : undefined, undefined);
    assert.strictEqual("projectId" in response! ? response.projectId : undefined, undefined);
    assert.strictEqual(response!.promptTokens, 100);
  });
});
