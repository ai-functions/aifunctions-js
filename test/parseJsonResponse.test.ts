/**
 * Unit tests for parseJsonResponse (deterministic path and optional LLM fallback with mock).
 * No API key required for deterministic; mock client for fallback. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseJsonResponse } from "../dist/functions/index.js";

describe("parseJsonResponse", () => {
    it("returns parsed json when text contains valid JSON object", async () => {
        const r = await parseJsonResponse('pre {"x": 42} post');
        assert.strictEqual(r.ok, true);
        const j = (r as { json: Record<string, number> }).json;
        assert.strictEqual(j.x, 42);
    });

    it("returns failure when no JSON and no llmFallback", async () => {
        const r = await parseJsonResponse("no json");
        assert.strictEqual(r.ok, false);
        assert.strictEqual((r as { errorCode: string }).errorCode, "NO_JSON_OBJECT");
    });

    it("when llmFallback true and deterministic fails, uses LLM then extracts", async () => {
        const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };
        const mockClient = {
            ask: async () => ({ text: '  {"recovered": true}  ', usage }),
            testConnection: async () => true,
        };
        const r = await parseJsonResponse("garbage text", {
            llmFallback: true,
            client: mockClient as never,
        });
        assert.strictEqual(r.ok, true);
        assert.deepStrictEqual((r as { json: unknown }).json, { recovered: true });
    });
});
