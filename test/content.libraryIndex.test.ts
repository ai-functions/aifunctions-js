/**
 * Unit tests for library index (getLibraryIndex, validateLibraryIndex, validateSkillIndexEntry).
 * No LLM or real content backend required.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLibraryIndex,
  LIBRARY_INDEX_FALLBACK_REL,
  updateLibraryIndex,
  validateLibraryIndex,
  validateSkillIndexEntry,
  type AggregateIndex,
  type SkillIndexEntry,
} from "../dist/src/index.js";

const validAggregate: AggregateIndex = {
  schemaVersion: "1.0",
  generatedAt: "2026-03-04T12:00:00Z",
  skills: [{ $refKey: "skills/index/v1/extractTopics.json" }],
};

const validSkillEntry: SkillIndexEntry = {
  schemaVersion: "1.0",
  id: "extractTopics",
  displayName: "Extract Topics",
  description: "Extracts key topics from input text.",
  source: {
    contentPrefix: "skills/",
    files: [
      { key: "skills/extractTopics-instructions.md", kind: "instructions" },
      { key: "skills/extractTopics-rules.json", kind: "rules" },
    ],
    contentHash: "sha256:abc123",
  },
  runtime: { callName: "extractTopics", modes: ["weak", "normal", "strong"] },
  io: {
    input: {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" } },
      required: ["text"],
    },
    output: {
      type: "object",
      additionalProperties: false,
      properties: { topics: { type: "array", items: { type: "string" } } },
      required: ["topics"],
    },
  },
  quality: { confidence: 0.9, method: "llm-inferred", notes: [] },
};

describe("validateLibraryIndex", () => {
  it("accepts valid aggregate index", () => {
    const r = validateLibraryIndex(validAggregate);
    assert.strictEqual(r.valid, true);
    assert.strictEqual(r.errors, undefined);
  });
  it("rejects non-object", () => {
    const r = validateLibraryIndex(null);
    assert.strictEqual(r.valid, false);
    assert.ok(Array.isArray(r.errors) && r.errors.length > 0);
  });
  it("rejects wrong schemaVersion", () => {
    const r = validateLibraryIndex({ ...validAggregate, schemaVersion: "2.0" });
    assert.strictEqual(r.valid, false);
  });
  it("rejects missing skills array", () => {
    const r = validateLibraryIndex({ schemaVersion: "1.0", generatedAt: "" });
    assert.strictEqual(r.valid, false);
  });
});

describe("validateSkillIndexEntry", () => {
  it("accepts valid skill entry", () => {
    const r = validateSkillIndexEntry(validSkillEntry);
    assert.strictEqual(r.valid, true);
  });
  it("rejects missing id", () => {
    const r = validateSkillIndexEntry({ ...validSkillEntry, id: "" });
    assert.strictEqual(r.valid, false);
  });
  it("rejects invalid source.contentHash", () => {
    const r = validateSkillIndexEntry({
      ...validSkillEntry,
      source: { ...validSkillEntry.source, contentHash: "invalid" },
    });
    assert.strictEqual(r.valid, false);
  });
  it("rejects missing io.input type object", () => {
    const r = validateSkillIndexEntry({
      ...validSkillEntry,
      io: { ...validSkillEntry.io, input: { type: "string" } as never },
    });
    assert.strictEqual(r.valid, false);
  });
  it("accepts built-in source with null confidence", () => {
    const r = validateSkillIndexEntry({
      ...validSkillEntry,
      source: { kind: "built-in" },
      quality: { confidence: null, method: "not-judged", notes: [] },
    });
    assert.strictEqual(r.valid, true);
  });
});

describe("getLibraryIndex", () => {
  it("returns index when resolver has key", async () => {
    const resolver = {
      get: async () => JSON.stringify(validAggregate),
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    const index = await getLibraryIndex({ resolver });
    assert.strictEqual(index.schemaVersion, "1.0");
    assert.strictEqual(index.skills.length, 1);
    assert.strictEqual(index.skills[0].$refKey, "skills/index/v1/extractTopics.json");
  });
  it("returns empty aggregate when allowMissing and key missing and no fallback", async () => {
    const resolver = {
      get: async () => {
        throw new Error("ENOENT");
      },
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    const index = await getLibraryIndex({ resolver, allowMissing: true, fallbackPath: null });
    assert.strictEqual(index.schemaVersion, "1.0");
    assert.strictEqual(index.skills.length, 0);
  });
  it("returns fallback when allowMissing and key missing and fallback exists", async () => {
    const resolver = {
      get: async () => {
        throw new Error("ENOENT");
      },
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    const index = await getLibraryIndex({ resolver, allowMissing: true });
    assert.strictEqual(index.schemaVersion, "1.0");
    assert.ok(Array.isArray(index.skills));
  });
  it("throws when missing and allowMissing false", async () => {
    const resolver = {
      get: async () => {
        throw new Error("not found");
      },
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    await assert.rejects(() => getLibraryIndex({ resolver, allowMissing: false }), /not found|empty|missing/);
  });
});

describe("library index fallback (.docs)", () => {
  it("fallback file exists and is valid aggregate", () => {
    const fallbackPath = path.join(process.cwd(), LIBRARY_INDEX_FALLBACK_REL);
    assert.ok(existsSync(fallbackPath), `Fallback file should exist at ${fallbackPath}`);
    const raw = readFileSync(fallbackPath, "utf-8");
    const data = JSON.parse(raw) as unknown;
    const result = validateLibraryIndex(data);
    assert.strictEqual(result.valid, true, result.errors?.join("; "));
    assert.strictEqual((data as AggregateIndex).schemaVersion, "1.0");
    assert.ok(Array.isArray((data as AggregateIndex).skills));
  });
  it("fallback has valid aggregate (skills array; empty or populated)", () => {
    const fallbackPath = path.join(process.cwd(), LIBRARY_INDEX_FALLBACK_REL);
    const data = JSON.parse(readFileSync(fallbackPath, "utf-8")) as AggregateIndex;
    const result = validateLibraryIndex(data);
    assert.strictEqual(result.valid, true);
    assert.ok(Array.isArray(data.skills), "skills must be array");
  });
  it("getLibraryIndex with allowMissing uses fallback when resolver returns empty", async () => {
    const resolver = {
      get: async () => "",
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    const index = await getLibraryIndex({ resolver, allowMissing: true });
    assert.strictEqual(index.schemaVersion, "1.0");
    assert.ok(Array.isArray(index.skills));
  });
});

describe("updateLibraryIndex includes built-ins and quality method", () => {
  it("writes built-in entries when content is empty", async () => {
    const store = new Map<string, string>();
    const resolver = {
      get: async (key: string) => {
        if (!store.has(key)) throw new Error("ENOENT");
        return store.get(key)!;
      },
      set: async (key: string, value: string) => {
        store.set(key, value);
      },
      listKeys: async () => [],
    } as unknown as Parameters<typeof updateLibraryIndex>[0]["resolver"];

    const report = await updateLibraryIndex({
      resolver,
      includeBuiltIn: true,
      staticOnly: true,
    });
    assert.ok(report.refKeys.length >= 23);
    const aggregateRaw = store.get("skills/index.v1.json");
    assert.ok(aggregateRaw);
    const aggregate = JSON.parse(aggregateRaw!) as AggregateIndex;
    assert.ok(aggregate.skills.some((s) => s.$refKey.endsWith("/classify.json")));
    const classifyRaw = store.get("skills/index/v1/classify.json");
    assert.ok(classifyRaw);
    const classifyEntry = JSON.parse(classifyRaw!) as SkillIndexEntry;
    assert.deepStrictEqual(classifyEntry.source, { kind: "built-in" });
    assert.strictEqual(classifyEntry.quality.method, "not-judged");
    assert.strictEqual(classifyEntry.quality.confidence, null);
  });

  it("static content entries do not use hardcoded 0.4 confidence", async () => {
    const store = new Map<string, string>();
    store.set("skills/demo/normal.md", "Demo instructions");
    const resolver = {
      get: async (key: string) => {
        if (!store.has(key)) throw new Error("ENOENT");
        return store.get(key)!;
      },
      set: async (key: string, value: string) => {
        store.set(key, value);
      },
      listKeys: async () => ["skills/demo/normal.md"],
    } as unknown as Parameters<typeof updateLibraryIndex>[0]["resolver"];

    await updateLibraryIndex({
      resolver,
      includeBuiltIn: false,
      staticOnly: true,
    });
    const demoRaw = store.get("skills/index/v1/demo.json");
    assert.ok(demoRaw);
    const demoEntry = JSON.parse(demoRaw!) as SkillIndexEntry;
    assert.strictEqual(demoEntry.quality.method, "static");
    assert.strictEqual(demoEntry.quality.confidence, null);
  });

  it("judgeAfterIndex sets judged confidence when examples exist", async () => {
    const store = new Map<string, string>();
    const resolver = {
      get: async (key: string) => {
        if (!store.has(key)) throw new Error("ENOENT");
        return store.get(key)!;
      },
      set: async (key: string, value: string) => {
        store.set(key, value);
      },
      listKeys: async () => [],
    } as unknown as Parameters<typeof updateLibraryIndex>[0]["resolver"];

    const mockClient = {
      ask: async () => ({
        text: JSON.stringify({
          schemaVersion: "ai.judge.v1",
          pass: true,
          maxPoints: 1,
          lostPoints: 0.12,
          scorePoints: 0.88,
          scoreNormalized: 0.88,
          threshold: 0.8,
          ruleResults: [],
          failedRules: [],
          summary: "Looks good",
        }),
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        model: "openai/gpt-5-nano",
      }),
      testConnection: async () => true,
    };

    await updateLibraryIndex({
      resolver,
      includeBuiltIn: true,
      staticOnly: true,
      judgeAfterIndex: true,
      client: mockClient as never,
    });

    const entryRaw = store.get("skills/index/v1/extractTopics.json");
    assert.ok(entryRaw);
    const entry = JSON.parse(entryRaw!) as SkillIndexEntry;
    assert.strictEqual(entry.quality.method, "judged");
    assert.strictEqual(entry.quality.confidence, 0.88);
    assert.strictEqual(entry.quality.judgeScore, 0.88);
    assert.ok(typeof entry.quality.judgedAt === "string");
  });
});
