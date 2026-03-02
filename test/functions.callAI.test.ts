/**
 * Unit tests for callAI (and callAIStream) with a mocked client.
 * No API key required. Run after build: npm run build && npm run test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { callAI, callAIStream } from "../dist/functions/index.js";

const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };

function createMockClient(returnText: string, capture: { system?: string }) {
    return {
        ask: async (_prompt: string, opts: { system?: string }) => {
            capture.system = opts.system;
            return { text: returnText, usage };
        },
        testConnection: async () => true,
    };
}

describe("callAI (mocked)", () => {
    it("uses weak instructions when mode is weak", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"value":1}', capture);
        const weakInstruction = "You are weak.";
        const strongInstruction = "You are strong.";
        await callAI({
            client,
            mode: "weak",
            instructions: { weak: weakInstruction, strong: strongInstruction },
            prompt: "test",
        });
        assert.strictEqual(capture.system, weakInstruction);
    });

    it("uses strong instructions when mode is strong", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"value":1}', capture);
        const weakInstruction = "You are weak.";
        const strongInstruction = "You are strong.";
        await callAI({
            client,
            mode: "strong",
            instructions: { weak: weakInstruction, strong: strongInstruction },
            prompt: "test",
        });
        assert.strictEqual(capture.system, strongInstruction);
    });

    it("defaults to strong mode", async () => {
        const capture: { system?: string } = {};
        const client = createMockClient('{"value":1}', capture);
        await callAI({
            client,
            instructions: { weak: "w", strong: "s" },
            prompt: "test",
        });
        assert.strictEqual(capture.system, "s");
    });

    it("strips markdown code fence and parses JSON", async () => {
        const client = createMockClient('```json\n{"x": 42}\n```', {});
        const result = await callAI<{ x: number }>({
            client,
            instructions: { weak: "w", strong: "s" },
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
            instructions: { weak: "w", strong: "s" },
            prompt: "test",
        });
        assert.strictEqual(result.data.a, "b");
    });
});

describe("callAIStream (mocked)", () => {
    it("yields text, usage, and done when client has no askStream", async () => {
        const client = createMockClient('{"ok":true}', {});
        const chunks: Array<{ type: string; text?: string }> = [];
        for await (const ch of callAIStream({
            client,
            instructions: { weak: "w", strong: "s" },
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
