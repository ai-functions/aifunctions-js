/**
 * Unit tests for skills content (keys, resolve with mock resolver).
 * No network or real nx-content backend required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    DEFAULT_SKILLS_REPO_URL,
    DEFAULT_SKILLS_BRANCH,
    getSkillsResolver,
    skillInstructionsKeyForMode,
    skillRulesKey,
    resolveSkillInstructions,
    resolveSkillRules,
} from "../dist/src/index.js";

describe("skillsRepo constants", () => {
    it("DEFAULT_SKILLS_REPO_URL is a non-empty string", () => {
        assert.strictEqual(typeof DEFAULT_SKILLS_REPO_URL, "string");
        assert.ok(DEFAULT_SKILLS_REPO_URL.length > 0);
    });
    it("DEFAULT_SKILLS_BRANCH is main", () => {
        assert.strictEqual(DEFAULT_SKILLS_BRANCH, "main");
    });
});

describe("skill key helpers", () => {
    it("skillInstructionsKeyForMode builds key with skill and mode", () => {
        assert.strictEqual(
            skillInstructionsKeyForMode("extractTopics", "normal"),
            "skills/extractTopics/normal"
        );
        assert.strictEqual(
            skillInstructionsKeyForMode("ai.judge.v1", "strong"),
            "skills/ai.judge.v1/strong"
        );
    });
    it("skillRulesKey builds rules key", () => {
        assert.strictEqual(skillRulesKey("extractTopics"), "skills/extractTopics/rules");
        assert.strictEqual(skillRulesKey("ai.judge.v1"), "skills/ai.judge.v1/rules");
    });
});

describe("getSkillsResolver", () => {
    it("returns a resolver with get and resolveInstructions", () => {
        const resolver = getSkillsResolver();
        assert.strictEqual(typeof resolver.get, "function");
        assert.strictEqual(typeof resolver.resolveInstructions, "function");
    });
    it("accepts overrides without throwing", () => {
        const resolver = getSkillsResolver({ localRoot: "." });
        assert.strictEqual(typeof resolver.get, "function");
    });
});

describe("resolveSkillInstructions with mock resolver", () => {
    it("returns text from resolver.resolveInstructions", async () => {
        const mockResolver = {
            resolveInstructions: async () => ({ text: "You are a helpful assistant." }),
        } as Parameters<typeof resolveSkillInstructions>[0];
        const text = await resolveSkillInstructions(mockResolver, "testSkill", "normal");
        assert.strictEqual(text, "You are a helpful assistant.");
    });
});

describe("resolveSkillRules with mock resolver", () => {
    it("returns parsed rules from resolver.get", async () => {
        const mockResolver = {
            get: async () =>
                JSON.stringify([
                    { rule: "Output JSON only.", weight: 2 },
                    { rule: "Be concise.", weight: 1 },
                ]),
        } as Parameters<typeof resolveSkillRules>[0];
        const rules = await resolveSkillRules(mockResolver, "testSkill");
        assert.strictEqual(rules.length, 2);
        assert.strictEqual(rules[0].rule, "Output JSON only.");
        assert.strictEqual(rules[0].weight, 2);
    });
    it("returns empty array when get throws", async () => {
        const mockResolver = {
            get: async () => {
                throw new Error("not found");
            },
        } as Parameters<typeof resolveSkillRules>[0];
        const rules = await resolveSkillRules(mockResolver, "missing");
        assert.strictEqual(rules.length, 0);
    });
});
