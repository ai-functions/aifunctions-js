import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildFullLibrarySnapshot } from "../dist/src/index.js";

describe("buildFullLibrarySnapshot", () => {
  it("builds full snapshot with embedded source file content", async () => {
    const aggregate = {
      schemaVersion: "1.0",
      generatedAt: "2026-03-06T00:00:00.000Z",
      skills: [{ $refKey: "skills/index/v1/demo.json" }],
    };
    const entry = {
      schemaVersion: "1.0",
      id: "demo",
      displayName: "Demo",
      description: "Demo skill",
      source: {
        contentPrefix: "skills/",
        files: [{ key: "skills/demo/normal.md", kind: "instructions" }],
        contentHash: "sha256:abc",
      },
      runtime: { callName: "demo" },
      io: {
        input: { type: "object", additionalProperties: false, properties: {}, required: [] },
        output: { type: "object", additionalProperties: false, properties: {}, required: [] },
      },
      quality: { confidence: 0.5, method: "llm-inferred", notes: [] },
    };
    const resolver = {
      get: async (key: string) => {
        if (key === "skills/index.v1.json") return JSON.stringify(aggregate);
        if (key === "skills/index/v1/demo.json") return JSON.stringify(entry);
        if (key === "skills/demo/normal.md") return "Demo instructions content";
        throw new Error("not found");
      },
      listKeys: async () => [],
    } as unknown as Parameters<typeof buildFullLibrarySnapshot>[0]["resolver"];

    const full = await buildFullLibrarySnapshot({ resolver });
    assert.strictEqual(full.schemaVersion, "1.0-full");
    assert.strictEqual(full.skills.length, 1);
    assert.strictEqual(full.skills[0]?.id, "demo");
    assert.strictEqual(full.skills[0]?.source.embeddedFiles.length, 1);
    assert.strictEqual(full.skills[0]?.source.embeddedFiles[0]?.content, "Demo instructions content");
  });

  it("supports built-in source entries without embedded files", async () => {
    const aggregate = {
      schemaVersion: "1.0",
      generatedAt: "2026-03-06T00:00:00.000Z",
      skills: [{ $refKey: "skills/index/v1/classify.json" }],
    };
    const entry = {
      schemaVersion: "1.0",
      id: "classify",
      displayName: "Classify",
      description: "Built-in classify function",
      source: { kind: "built-in" },
      runtime: { callName: "classify" },
      io: {
        input: { type: "object", additionalProperties: false, properties: {}, required: [] },
        output: { type: "object", additionalProperties: false, properties: {}, required: [] },
      },
      quality: { confidence: null, method: "not-judged", notes: [] },
    };
    const resolver = {
      get: async (key: string) => {
        if (key === "skills/index.v1.json") return JSON.stringify(aggregate);
        if (key === "skills/index/v1/classify.json") return JSON.stringify(entry);
        throw new Error("not found");
      },
      listKeys: async () => [],
    } as unknown as Parameters<typeof buildFullLibrarySnapshot>[0]["resolver"];

    const full = await buildFullLibrarySnapshot({ resolver });
    assert.strictEqual(full.skills.length, 1);
    assert.deepStrictEqual(full.skills[0]?.source, { kind: "built-in" });
  });
});
