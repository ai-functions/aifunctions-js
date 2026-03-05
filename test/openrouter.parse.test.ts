import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { createClient } from "../dist/src/index.js";

const originalFetch = globalThis.fetch;

describe("OpenRouter response parsing", () => {
  let lastBody: unknown;

  beforeEach(() => {
    lastBody = undefined;
    globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
      lastBody = init?.body ? JSON.parse(init.body as string) : undefined;
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "Hello from model" } }],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 5,
            total_tokens: 15,
            cost: 0.001,
          },
          model: "openai/gpt-4o",
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("parses choices[0].message.content as text", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    const res = await ai.ask("Hi", {
      model: "openai/gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
    });
    assert.strictEqual(res.text, "Hello from model");
    assert.strictEqual(res.model, "openai/gpt-4o");
  });

  it("normalizes usage from response.usage", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    const res = await ai.ask("Hi", {
      model: "openai/gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
    });
    assert.strictEqual(res.usage.prompt_tokens, 10);
    assert.strictEqual(res.usage.completion_tokens, 5);
    assert.strictEqual(res.usage.total_tokens, 15);
    assert.strictEqual((res.usage as { cost?: number }).cost, 0.001);
  });

  it("returns empty text when choices[0].message.content is missing", async () => {
    globalThis.fetch = async (_input: string | URL | Request) => {
      return new Response(
        JSON.stringify({
          choices: [{}],
          usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    const res = await ai.ask("Hi", {
      model: "openai/gpt-4o",
      maxTokens: 100,
      temperature: 0.7,
    });
    assert.strictEqual(res.text, "");
  });

  it("resolves model and preset from opts.mode when model not provided", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
    });
    await ai.ask("Hi", {
      mode: "strong",
      maxTokens: 100,
      temperature: 0.5,
    });
    const body = lastBody as { model: string; temperature: number; max_completion_tokens: number };
    assert.strictEqual(body.model, "gpt-5.2", "strong mode uses preset model gpt-5.2");
    assert.strictEqual(body.temperature, 0.5, "explicit temperature overrides preset");
    assert.strictEqual(body.max_completion_tokens, 100, "explicit maxTokens overrides preset");
  });

  it("uses client models config over preset when provided", async () => {
    const ai = createClient({
      backend: "openrouter",
      openrouter: { apiKey: "test-key" },
      models: { strong: "anthropic/claude-3-5-sonnet" },
    });
    await ai.ask("Hi", {
      mode: "strong",
      maxTokens: 512,
      temperature: 0.3,
    });
    const body = lastBody as { model: string };
    assert.strictEqual(body.model, "anthropic/claude-3-5-sonnet");
  });
});
