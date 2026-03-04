/**
 * Unit tests for skills content (keys, resolve, file-based get/set, discovery, versions).
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
    skillInstructionsFileKey,
    skillRulesFileKey,
    resolveSkillInstructions,
    resolveSkillRules,
    getSkillInstructions,
    setSkillInstructions,
    getSkillRules,
    setSkillRules,
    getSkillNamesFromContent,
    getSkillInstructionVersions,
    getSkillRulesVersions,
    getSkillInstructionsAtRef,
    getSkillRulesAtRef,
    setSkillInstructionsActiveVersion,
    setSkillRulesActiveVersion,
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
    it("skillInstructionsFileKey builds file-based instructions key", () => {
        assert.strictEqual(skillInstructionsFileKey("extractTopics"), "skills/extractTopics-instructions.md");
        assert.strictEqual(skillInstructionsFileKey("mySkill"), "skills/mySkill-instructions.md");
    });
    it("skillRulesFileKey builds file-based rules key", () => {
        assert.strictEqual(skillRulesFileKey("extractTopics"), "skills/extractTopics-rules.json");
        assert.strictEqual(skillRulesFileKey("mySkill"), "skills/mySkill-rules.json");
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

describe("getSkillInstructions / setSkillInstructions (file-based)", () => {
    it("getSkillInstructions returns content from resolver.get", async () => {
        const mockResolver = {
            get: async () => "You must output JSON only.",
        } as Parameters<typeof getSkillInstructions>[0];
        const text = await getSkillInstructions(mockResolver, "mySkill");
        assert.strictEqual(text, "You must output JSON only.");
    });
    it("getSkillInstructions returns empty string when get throws", async () => {
        const mockResolver = { get: async () => { throw new Error("missing"); } } as Parameters<typeof getSkillInstructions>[0];
        const text = await getSkillInstructions(mockResolver, "missing");
        assert.strictEqual(text, "");
    });
    it("setSkillInstructions calls resolver.set with file key", async () => {
        let setKey: string | null = null;
        let setContent: string | null = null;
        const mockResolver = {
            set: async (key: string, content: string) => {
                setKey = key;
                setContent = content;
            },
        } as Parameters<typeof setSkillInstructions>[0];
        await setSkillInstructions(mockResolver, "mySkill", "New instructions.");
        assert.strictEqual(setKey, "skills/mySkill-instructions.md");
        assert.strictEqual(setContent, "New instructions.");
    });
});

describe("getSkillRules / setSkillRules (file-based)", () => {
    it("getSkillRules returns parsed rules from resolver.get", async () => {
        const mockResolver = {
            get: async () => JSON.stringify([{ rule: "Be concise.", weight: 1 }, { rule: "JSON only.", weight: 2 }]),
        } as Parameters<typeof getSkillRules>[0];
        const rules = await getSkillRules(mockResolver, "mySkill");
        assert.strictEqual(rules.length, 2);
        assert.strictEqual(rules[0].rule, "Be concise.");
        assert.strictEqual(rules[0].weight, 1);
        assert.strictEqual(rules[1].rule, "JSON only.");
        assert.strictEqual(rules[1].weight, 2);
    });
    it("getSkillRules returns empty array when get throws or invalid JSON", async () => {
        const mockResolver = { get: async () => { throw new Error("missing"); } } as Parameters<typeof getSkillRules>[0];
        assert.strictEqual((await getSkillRules(mockResolver, "missing")).length, 0);
    });
    it("setSkillRules calls resolver.set with JSON string", async () => {
        let setKey: string | null = null;
        let setContent: string | null = null;
        const mockResolver = {
            set: async (key: string, content: string) => {
                setKey = key;
                setContent = content;
            },
        } as Parameters<typeof setSkillRules>[0];
        await setSkillRules(mockResolver, "mySkill", [{ rule: "One rule.", weight: 1 }]);
        assert.strictEqual(setKey, "skills/mySkill-rules.json");
        assert.ok(setContent?.includes("One rule."));
        assert.ok(JSON.parse(setContent!).length === 1);
    });
});

describe("getSkillNamesFromContent", () => {
    it("derives names from file-based keys (instructions and rules)", async () => {
        const mockResolver = {
            listKeys: async () => [
                "skills/foo-instructions.md",
                "skills/foo-rules.json",
                "skills/bar-instructions.md",
            ],
        } as Parameters<typeof getSkillNamesFromContent>[0];
        const names = await getSkillNamesFromContent(mockResolver);
        assert.deepStrictEqual(names.sort(), ["bar", "foo"]);
    });
    it("derives names from legacy mode keys", async () => {
        const mockResolver = {
            listKeys: async () => ["skills/extractTopics/weak", "skills/extractTopics/normal", "skills/matchLists/weak"],
        } as Parameters<typeof getSkillNamesFromContent>[0];
        const names = await getSkillNamesFromContent(mockResolver);
        assert.deepStrictEqual(names.sort(), ["extractTopics", "matchLists"]);
    });
    it("merges file-based and legacy keys without duplicates", async () => {
        const mockResolver = {
            listKeys: async () => ["skills/foo-instructions.md", "skills/foo/weak"],
        } as Parameters<typeof getSkillNamesFromContent>[0];
        const names = await getSkillNamesFromContent(mockResolver);
        assert.deepStrictEqual(names, ["foo"]);
    });
});

describe("version APIs (require nx-content getVersions, getAtRef, setActiveVersion)", () => {
    const versionEntry = { sha: "abc123", message: "chore: update", date: "2025-01-01", author: "dev" };
    const mockResolverWithVersions = {
        getVersions: async () => [versionEntry],
        getAtRef: async () => "Instructions at ref.",
        setActiveVersion: async () => ({ updated: true }),
    };
    it("getSkillInstructionVersions returns entries from resolver.getVersions", async () => {
        const resolver = mockResolverWithVersions as Parameters<typeof getSkillInstructionVersions>[0];
        const versions = await getSkillInstructionVersions(resolver, "mySkill");
        assert.strictEqual(versions.length, 1);
        assert.strictEqual(versions[0].sha, "abc123");
        assert.strictEqual(versions[0].message, "chore: update");
    });
    it("getSkillRulesVersions returns entries from resolver.getVersions", async () => {
        const resolver = mockResolverWithVersions as Parameters<typeof getSkillRulesVersions>[0];
        const versions = await getSkillRulesVersions(resolver, "mySkill");
        assert.strictEqual(versions.length, 1);
        assert.strictEqual(versions[0].sha, "abc123");
    });
    it("getSkillInstructionsAtRef returns content from resolver.getAtRef", async () => {
        const resolver = mockResolverWithVersions as Parameters<typeof getSkillInstructionsAtRef>[0];
        const text = await getSkillInstructionsAtRef(resolver, "mySkill", "abc123");
        assert.strictEqual(text, "Instructions at ref.");
    });
    it("getSkillRulesAtRef returns parsed rules", async () => {
        const resolver = {
            ...mockResolverWithVersions,
            getAtRef: async () => JSON.stringify([{ rule: "At ref.", weight: 1 }]),
        } as Parameters<typeof getSkillRulesAtRef>[0];
        const rules = await getSkillRulesAtRef(resolver, "mySkill", "abc123");
        assert.strictEqual(rules.length, 1);
        assert.strictEqual(rules[0].rule, "At ref.");
    });
    it("setSkillInstructionsActiveVersion calls resolver.setActiveVersion", async () => {
        let calledKey: string | null = null;
        let calledRef: string | null = null;
        const resolver = {
            ...mockResolverWithVersions,
            setActiveVersion: async (key: string, ref: string) => {
                calledKey = key;
                calledRef = ref;
                return { updated: true };
            },
        } as Parameters<typeof setSkillInstructionsActiveVersion>[0];
        const result = await setSkillInstructionsActiveVersion(resolver, "mySkill", "abc123", { commit: true });
        assert.strictEqual(result.updated, true);
        assert.strictEqual(calledKey, "skills/mySkill-instructions.md");
        assert.strictEqual(calledRef, "abc123");
    });
    it("setSkillRulesActiveVersion calls resolver.setActiveVersion", async () => {
        let calledKey: string | null = null;
        const resolver = {
            ...mockResolverWithVersions,
            setActiveVersion: async (key: string) => {
                calledKey = key;
                return { updated: true };
            },
        } as Parameters<typeof setSkillRulesActiveVersion>[0];
        await setSkillRulesActiveVersion(resolver, "mySkill", "v1");
        assert.strictEqual(calledKey, "skills/mySkill-rules.json");
    });
    it("version APIs throw when resolver lacks getVersions/getAtRef/setActiveVersion", async () => {
        const resolverNoVersions = { get: async () => "", set: async () => {}, listKeys: async () => [] } as Parameters<typeof getSkillInstructionVersions>[0];
        await assert.rejects(
            () => getSkillInstructionVersions(resolverNoVersions, "x"),
            /ContentResolver does not support version APIs/
        );
        await assert.rejects(
            () => getSkillInstructionsAtRef(resolverNoVersions, "x", "HEAD"),
            /ContentResolver does not support version APIs/
        );
        await assert.rejects(
            () => setSkillInstructionsActiveVersion(resolverNoVersions, "x", "HEAD"),
            /ContentResolver does not support version APIs/
        );
    });
});
