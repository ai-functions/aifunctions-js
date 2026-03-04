/**
 * Unit tests for askJson with mocked client. No API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { askJson } from "../dist/functions/index.js";

const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };

describe("askJson", () => {
  it("returns AiJsonSuccess with parsed data and includes single-JSON constraint in system", async () => {
    const capture: { system?: string } = {};
    const client = {
      ask: async (_p: string, opts: { system?: string }) => {
        capture.system = opts.system;
        return { text: '{"value": 10}', usage };
      },
      testConnection: async () => true,
    };
    const result = await askJson<{ value: number }>({
      client: client as never,
      prompt: "test",
      instructions: { weak: "Do it.", normal: "Do it." },
    });
    assert.strictEqual(result.ok, true);
    if (result.ok) assert.strictEqual(result.parsed.value, 10);
    assert.ok(capture.system?.includes("JSON") || capture.system?.includes("json"));
  });

  it("appends outputContract and requiredOutputShape to instruction", async () => {
    const capture: { system?: string } = {};
    const client = {
      ask: async (_p: string, opts: { system?: string }) => {
        capture.system = opts.system;
        return { text: '{"summary": "ok"}', usage };
      },
      testConnection: async () => true,
    };
    const result = await askJson({
      client: client as never,
      prompt: "Summarize.",
      instructions: { weak: "W", normal: "N" },
      outputContract: "Object with key summary.",
      requiredOutputShape: "{ summary: string }",
    });
    assert.strictEqual(result.ok, true);
    assert.ok(capture.system?.includes("Object with key summary"));
    assert.ok(capture.system?.includes("summary: string"));
  });
});
