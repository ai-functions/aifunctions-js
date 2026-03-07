/**
 * Unit tests for the skills router (run, getSkillNames, runWithContent).
 * Includes tests that rules from content are used automatically.
 * No API key required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run, runWithContent, getSkillNames, judge, judgeV1 } from "../dist/functions/index.js";

describe("router", () => {
    it("getSkillNames returns clean names (judge, compare, …) not V1/dotted aliases", () => {
        const names = getSkillNames();
        assert.ok(Array.isArray(names));
        assert.ok(names.length > 0);
        assert.ok(names.includes("extractTopics"));
        assert.ok(names.includes("matchLists"));
        assert.ok(names.includes("judge"));
        assert.ok(names.includes("compare"));
        assert.ok(names.includes("collectionMapping"));
        assert.ok(!names.includes("ai.judge.v1"));
        assert.ok(!names.includes("recordsMapper.collectionMapping.v1"));
    });

    it("judge and judgeV1 resolve to the same function", () => {
        assert.strictEqual(judge, judgeV1);
    });

    it("run(judge, …) and run(ai.judge.v1, …) both resolve to same skill", async () => {
        const request = {
            instructions: "Return JSON.",
            response: '{"ok":true}',
            rules: [{ rule: "Output valid JSON.", weight: 1 }],
            threshold: 0.7,
            client: {
                ask: async () => ({
                    text: '{"pass":true,"scoreNormalized":1,"ruleResults":[]}',
                    usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
                }),
                testConnection: async () => true,
            },
        };
        const byClean = await run("judge", request);
        const byV1 = await run("ai.judge.v1", request);
        assert.deepStrictEqual(byClean, byV1);
    });

    it("run(extractTopics, request) returns topics with mocked client", async () => {
        const result = (await run("extractTopics", {
            text: "Space exploration and NASA missions.",
            maxTopics: 2,
            mode: "normal",
            client: {
                ask: async () => ({
                    text: '{"topics":["Space","NASA"]}',
                    usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                }),
                testConnection: async () => true,
            },
        })) as { topics: string[] };
        assert.ok(Array.isArray(result.topics));
        assert.strictEqual(result.topics.length, 2);
        assert.strictEqual(result.topics[0], "Space");
        assert.strictEqual(result.topics[1], "NASA");
    });

    it("run(unknownSkill, {}) throws with message including available skills", async () => {
        await assert.rejects(
            async () => run("unknownSkill", {}),
            (err: Error) => {
                assert.ok(err.message.includes("Unknown function") || err.message.includes("Unknown skill"));
                assert.ok(err.message.includes("unknownSkill"));
                return true;
            }
        );
    });

    it("run(extractTopics, request, { resolver }) passes rules to skill and they appear in system instruction", async () => {
        const captured: { system?: string } = {};
        const resolver = {
            get: async (key: string) =>
                key === "functions/extractTopics/rules"
                    ? JSON.stringify([{ rule: "Must include a topics array.", weight: 1 }])
                    : undefined,
        };
        const result = (await run("extractTopics", {
            text: "AI and machine learning.",
            maxTopics: 2,
            mode: "normal",
            client: {
                ask: async (_prompt: string, opts?: { system?: string }) => {
                    captured.system = opts?.system;
                    return {
                        text: '{"topics":["AI","machine learning"]}',
                        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
                    };
                },
                testConnection: async () => true,
            },
        }, { resolver })) as { topics: string[] };
        assert.ok(Array.isArray(result.topics));
        assert.strictEqual(result.topics.length, 2);
        assert.ok(captured.system?.includes("Rules to follow"), "system should include rules section");
        assert.ok(captured.system?.includes("Must include a topics array."), "system should include rule text");
    });

    it("runWithContent uses rules when resolver provides rules via get()", async () => {
        const captured: { system?: string } = {};
        const resolver = {
            resolveInstructions: async () => ({ text: "You extract topics. Return JSON with a topics array." }),
            get: async (key: string) =>
                key === "functions/foo/rules" ? JSON.stringify([{ rule: "Output valid JSON only.", weight: 1 }]) : undefined,
        };
        const result = (await runWithContent("foo", { input: "test" }, {
            resolver: resolver as never,
            client: {
                ask: async (_p: string, opts?: { system?: string }) => {
                    captured.system = opts?.system;
                    return {
                        text: '{"topics":["test"]}',
                        usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
                    };
                },
                testConnection: async () => true,
            },
        })) as unknown;
        assert.ok(result);
        assert.ok(captured.system?.includes("Rules to follow"));
        assert.ok(captured.system?.includes("Output valid JSON only."));
    });
});
