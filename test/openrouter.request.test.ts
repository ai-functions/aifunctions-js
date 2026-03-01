import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createClient } from "../dist/index.js";

const originalFetch = globalThis.fetch;

describe("OpenRouter request body mapping", () => {
  let lastBody: Record<string, unknown>;

  beforeEach(() => {
    lastBody = {};
    globalThis.fetch = async (_input: string | URL | Request, init?: RequestInit) => {
      if (init?.body) {
        lastBody = JSON.parse(init.body as string) as Record<string, unknown>;
      }
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "ok" } }],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends max_completion_tokens (not max_tokens)", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    await ai.ask("Hi", {
      model: "openai/gpt-4o",
      maxTokens: 200,
      temperature: 0.5,
    });
    assert.strictEqual(lastBody.max_completion_tokens, 200);
    assert.strictEqual((lastBody as { max_tokens?: number }).max_tokens, undefined);
  });

  it("sends provider.order and allow_fallbacks when vendor is string", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key", allowFallbacksDefault: false },
    });
    await ai.ask("Hi", {
      model: "openai/gpt-4o",
      vendor: "openai",
      maxTokens: 100,
      temperature: 0.7,
    });
    const provider = lastBody.provider as { order: string[]; allow_fallbacks: boolean };
    assert.deepStrictEqual(provider?.order, ["openai"]);
    assert.strictEqual(provider?.allow_fallbacks, false);
  });

  it("sends provider.order array when vendor is string[]", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    await ai.ask("Hi", {
      model: "openai/gpt-4o",
      vendor: ["anthropic", "openai"],
      maxTokens: 100,
      temperature: 0.7,
    });
    const provider = lastBody.provider as { order: string[]; allow_fallbacks: boolean };
    assert.deepStrictEqual(provider?.order, ["anthropic", "openai"]);
    assert.strictEqual(provider?.allow_fallbacks, true);
  });

  it("includes system message when opts.system is provided", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    await ai.ask("Hi", {
      model: "openai/gpt-4o",
      system: "You are helpful.",
      maxTokens: 100,
      temperature: 0.7,
    });
    const messages = lastBody.messages as Array<{ role: string; content: string }>;
    assert.strictEqual(messages?.length, 2);
    assert.strictEqual(messages?.[0]?.role, "system");
    assert.strictEqual(messages?.[0]?.content, "You are helpful.");
    assert.strictEqual(messages?.[1]?.role, "user");
    assert.strictEqual(messages?.[1]?.content, "Hi");
  });
});

describe("OpenRouter error mapping", () => {
  beforeEach(() => {
    globalThis.fetch = async (_input: string | URL | Request) => {
      return new Response(JSON.stringify({ error: { message: "Rate limited" } }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("throws NxAiApiError with OPENROUTER_HTTP_ERROR for non-2xx", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    await assert.rejects(
      async () =>
        ai.ask("Hi", {
          model: "openai/gpt-4o",
          maxTokens: 100,
          temperature: 0.7,
        }),
      (err: unknown) => {
        const e = err as { name?: string; code?: string; status?: number };
        return e?.name === "NxAiApiError" && e?.code === "OPENROUTER_HTTP_ERROR" && e?.status === 429;
      }
    );
  });
});
