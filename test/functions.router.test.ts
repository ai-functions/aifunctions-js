/**
 * Unit tests for the skills router (run, getSkillNames).
 * No API key required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { run, getSkillNames } from "../dist/functions/index.js";

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
});
