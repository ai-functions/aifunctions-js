/**
 * Unit tests for callAI (and callAIStream) with a mocked client.
 * No API key required. Run after build: npm run build && npm run test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callAI, callAIStream } from "../dist/functions/index.js";
import { getModePreset } from "../dist/src/index.js";

const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };

function createMockClient(
    returnText: string,
    capture: { system?: string; maxTokens?: number; temperature?: number }
) {
    return {
        ask: async (
            _prompt: string,
            opts: { system?: string; maxTokens?: number; temperature?: number }
        ) => {
            capture.system = opts.system;
            capture.maxTokens = opts.maxTokens;
            capture.temperature = opts.temperature;
            return { text: returnText, usage };
        },
        testConnection: async () => true,
    };
}

describe("getModePreset", () => {
    it("weak preset uses llama-cpp backend and no model", () => {
        const p = getModePreset("weak");
        assert.strictEqual(p.backend, "llama-cpp");
        assert.strictEqual(p.model, undefined);
        assert.strictEqual(p.temperature, 0.1);
        assert.strictEqual(p.maxTokens, 4096);
    });
    it("normal preset uses openrouter and gpt-5-nano", () => {
        const p = getModePreset("normal");
        assert.strictEqual(p.backend, "openrouter");
        assert.strictEqual(p.model, "gpt-5-nano");
        assert.strictEqual(p.temperature, 0.7);
        assert.strictEqual(p.maxTokens, 4096);
    });
    it("strong preset uses openrouter and gpt-5.2", () => {
        const p = getModePreset("strong");
        assert.strictEqual(p.backend, "openrouter");
        assert.strictEqual(p.model, "gpt-5.2");
        assert.strictEqual(p.temperature, 0.7);
        assert.strictEqual(p.maxTokens, 8192);
    });
});

describe("callAI (mocked)", () => {
    it("uses weak instructions when mode is weak", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"value":1}', capture);
        const weakInstruction = "You are weak.";
        const normalInstruction = "You are normal.";
        await callAI({
            client,
            mode: "weak",
            instructions: { weak: weakInstruction, normal: normalInstruction },
            prompt: "test",
        });
        assert.strictEqual(capture.system, weakInstruction);
    });

    it("uses normal instructions when mode is normal", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"value":1}', capture);
        const weakInstruction = "You are weak.";
        const normalInstruction = "You are normal.";
        await callAI({
            client,
            mode: "normal",
            instructions: { weak: weakInstruction, normal: normalInstruction },
            prompt: "test",
        });
        assert.strictEqual(capture.system, normalInstruction);
    });

    it("defaults to normal mode", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"value":1}', capture);
        await callAI({
            client,
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        });
        assert.strictEqual(capture.system, "n");
    });

    it("strips markdown code fence and parses JSON", async () => {
        const client = createMockClient('```json\n{"x": 42}\n```', {});
        const result = await callAI<{ x: number }>({
            client,
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        });
        assert.strictEqual(result.data.x, 42);
        assert.strictEqual(result.usage.promptTokens, 1);
        assert.strictEqual(result.usage.completionTokens, 2);
    });

    it("parses plain JSON without fence", async () => {
        const client = createMockClient('{"a":"b"}', {});
        const result = await callAI<{ a: string }>({
            client,
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        });
        assert.strictEqual(result.data.a, "b");
    });

    it("uses strong instructions when mode is strong and instructions.strong provided", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"x":1}', capture);
        await callAI({
            client,
            mode: "strong",
            instructions: { weak: "w", normal: "n", strong: "s" },
            prompt: "test",
        });
        assert.strictEqual(capture.system, "s");
    });

    it("falls back to normal instructions when mode is strong but instructions.strong missing", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"x":1}', capture);
        await callAI({
            client,
            mode: "strong",
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        });
        assert.strictEqual(capture.system, "n");
    });

    it("uses preset temperature and maxTokens per mode when client provided", async () => {
        const capture: { temperature?: number; maxTokens?: number } = {};
        const client = createMockClient('{"x":1}', capture);
        await callAI({
            client,
            mode: "weak",
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        });
        assert.strictEqual(capture.temperature, 0.1);
        assert.strictEqual(capture.maxTokens, 4096);
    });

    it("strong preset uses 0.7 temperature and 8192 maxTokens", async () => {
        const capture: { temperature?: number; maxTokens?: number } = {};
        const client = createMockClient('{"x":1}', capture);
        await callAI({
            client,
            mode: "strong",
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        });
        assert.strictEqual(capture.temperature, 0.7);
        assert.strictEqual(capture.maxTokens, 8192);
    });
});

describe("callAIStream (mocked)", () => {
    it("yields text, usage, and done when client has no askStream", async () => {
        const client = createMockClient('{"ok":true}', {});
        const chunks: Array<{ type: string; text?: string }> = [];
        for await (const ch of callAIStream({
            client,
            instructions: { weak: "w", normal: "n" },
            prompt: "test",
        })) {
            chunks.push(ch as { type: string; text?: string });
        }
        const types = chunks.map((c) => c.type);
        assert.ok(types.includes("text"));
        assert.ok(types.includes("usage"));
        assert.ok(types.includes("done"));
        const textChunk = chunks.find((c) => c.type === "text");
        assert.ok(textChunk && textChunk.text === '{"ok":true}');
    });
});

describe("matchLists with existingMatches (mocked)", () => {
    it("returns existing matches only when all list1 items already mapped (no API call)", async () => {
        const source = { id: 1, name: "Apple" };
        const target = { item: "Apple", category: "Fruit" };
        let askCalled = false;
        const client = {
            ask: async () => {
                askCalled = true;
                return { text: "{}", usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 } };
            },
            testConnection: async () => true,
        };
        const { matchLists } = await import("../dist/functions/index.js");
        const result = await matchLists({
            list1: [source],
            list2: [target],
            guidance: "Match by name.",
            existingMatches: [{ source, target, reason: "existing" }],
            client,
        });
        assert.strictEqual(askCalled, false, "ask should not be called when all list1 already matched");
        assert.strictEqual(result.matches.length, 1);
        assert.strictEqual(result.matches[0].source.name, "Apple");
        assert.strictEqual(result.unmatched.length, 0);
    });
});
