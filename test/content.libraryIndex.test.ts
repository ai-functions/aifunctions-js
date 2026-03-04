/**
 * Unit tests for library index (getLibraryIndex, validateLibraryIndex, validateSkillIndexEntry).
 * No LLM or real content backend required.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getLibraryIndex,
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
  quality: { confidence: 0.9, notes: [] },
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
  it("returns empty aggregate when allowMissing and key missing", async () => {
    const resolver = {
      get: async () => {
        throw new Error("ENOENT");
      },
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    const index = await getLibraryIndex({ resolver, allowMissing: true });
    assert.strictEqual(index.schemaVersion, "1.0");
    assert.strictEqual(index.skills.length, 0);
  });
  it("throws when missing and allowMissing false", async () => {
    const resolver = {
      get: async () => {
        throw new Error("not found");
      },
      listKeys: async () => [],
    } as Parameters<typeof getLibraryIndex>[0]["resolver"];
    await assert.rejects(() => getLibraryIndex({ resolver, allowMissing: false }), /not found|empty/);
  });
});
