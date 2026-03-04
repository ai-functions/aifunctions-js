/**
 * Unit tests for runJsonCompletion. Uses mock client; no API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runJsonCompletion } from "../dist/functions/index.js";

describe("runJsonCompletion", () => {
  it("returns AiJsonSuccess with parsed, rawText, attemptsUsed from mock client", async () => {
    const client = {
      ask: async () => ({
        text: 'Result: {"schemaVersion":"v1","score":0.9}',
        usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
        model: "test-model",
      }),
      testConnection: async () => true,
    };
    const result = await runJsonCompletion({
      instruction: "Return a JSON object with schemaVersion and score.",
      options: { client: client as never },
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) {
      assert.strictEqual(result.rawText, 'Result: {"schemaVersion":"v1","score":0.9}');
      assert.deepStrictEqual(result.parsed, { schemaVersion: "v1", score: 0.9 });
      assert.strictEqual(result.usage?.prompt_tokens, 10);
      assert.strictEqual(result.usage?.completion_tokens, 20);
      assert.strictEqual(result.model, "test-model");
      assert.strictEqual(result.attemptsUsed, 1);
    }
  });

  it("extracts JSON from ```json block via mock client", async () => {
    const client = {
      ask: async () => ({
        text: "Here you go:\n```json\n{\"a\": 1}\n```",
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      }),
      testConnection: async () => true,
    };
    const result = await runJsonCompletion({
      instruction: "Return { a: 1 }.",
      options: { client: client as never },
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.deepStrictEqual(result.parsed, { a: 1 });
  });

  it("returns AiJsonError when no JSON in response after retries", async () => {
    const client = {
      ask: async () => ({ text: "no json at all", usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 } }),
      testConnection: async () => true,
    };
    const result = await runJsonCompletion({
      instruction: "Return JSON.",
      options: { client: client as never },
    });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.errorCode, "ERR_NO_JSON_FOUND");
      assert.strictEqual(typeof result.attemptsUsed, "number");
      assert.strictEqual(result.rawText, "no json at all");
    }
  });
});
