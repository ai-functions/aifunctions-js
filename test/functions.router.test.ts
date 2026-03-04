/**
 * Unit tests for the skills router (run, getSkillNames, runWithContent).
 * Includes tests that rules from content are used automatically.
 * No API key required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run, runWithContent, getSkillNames } from "../dist/functions/index.js";

describe("router", () => {
    it("getSkillNames returns non-empty list including extractTopics and matchLists", () => {
        const names = getSkillNames();
        assert.ok(Array.isArray(names));
        assert.ok(names.length > 0);
        assert.ok(names.includes("extractTopics"));
        assert.ok(names.includes("matchLists"));
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
                assert.ok(err.message.includes("Unknown skill"));
                assert.ok(err.message.includes("unknownSkill"));
                return true;
            }
        );
    });

    it("run(extractTopics, request, { resolver }) passes rules to skill and they appear in system instruction", async () => {
        const captured: { system?: string } = {};
        const resolver = {
            get: async (key: string) =>
                key === "skills/extractTopics-rules.json"
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
                key === "skills/foo-rules.json" ? JSON.stringify([{ rule: "Output valid JSON only.", weight: 1 }]) : undefined,
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
