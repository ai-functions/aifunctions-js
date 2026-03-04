/**
 * Unit tests for ask (ai.ask) with mocked client. No API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ask, run } from "../dist/functions/index.js";

const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };

describe("ask (ai.ask)", () => {
    it("builds INPUT_MD and returns parsed JSON", async () => {
        const capture: { system?: string; prompt?: string } = {};
        const client = {
            ask: async (prompt: string, opts: { system?: string }) => {
                capture.prompt = prompt;
                capture.system = opts.system;
                return { text: '{"main": "topic", "subTopics": ["a", "b"]}', usage };
            },
            testConnection: async () => true,
        };
        const data = await ask({
            client: client as never,
            instruction: "Extract main topic.",
            outputContract: "JSON with main and subTopics.",
            inputData: { text: "Article about X." },
        });
        assert.deepStrictEqual(data, { main: "topic", subTopics: ["a", "b"] });
        assert.ok(capture.prompt?.includes("## Instruction"));
        assert.ok(capture.prompt?.includes("## Output Contract"));
        assert.ok(capture.prompt?.includes("## Input Data"));
        assert.ok(capture.prompt?.includes("Article about X"));
    });

    it("run(ai.ask, request) returns same shape", async () => {
        const client = {
            ask: async () => ({ text: '{"done": true}', usage }),
            testConnection: async () => true,
        };
        const data = await run("ai.ask", {
            client,
            instruction: "Do nothing.",
            outputContract: "JSON with key done.",
        });
        assert.deepStrictEqual(data, { done: true });
    });
});
