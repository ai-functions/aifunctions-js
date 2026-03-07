import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  dedupeFunctionIds,
  parseUpdateLibraryIndexCliArgs,
  runAllFunctionsCoverage,
  type CoverageDeps,
} from "../dist/src/index.js";

function makeDeps(overrides?: Partial<CoverageDeps>): CoverageDeps {
  return {
    listFunctionIds: async () => [],
    listContentFunctionIds: async () => [],
    getRules: async () => [],
    setRules: async () => undefined,
    getInstructions: async () => "Do task",
    generateRules: async () => [{ rule: "Must be valid", weight: 1 }],
    getTestCases: async () => [],
    judge: async () => ({ scoreNormalized: 0.9, pass: true }),
    setValidation: async () => undefined,
    getRaceProfile: async () => ({}),
    race: async () => ({ bestModel: "openai/gpt-5-nano" }),
    setRaceProfile: async () => undefined,
    finalizeArtifacts: async () => undefined,
    ...overrides,
  };
}

describe("coverage orchestrator helpers", () => {
  it("dedupes aliases into canonical function ids", () => {
    const ids = dedupeFunctionIds([
      "judge",
      "ai.judge.v1",
      "compare",
      "ai.compare.v1",
      "recordsMapper.collectionMapping.v1",
      "collectionMapping",
    ]);
    assert.deepStrictEqual(ids, ["judge", "compare", "collectionMapping"]);
  });

  it("generates rules when missing", async () => {
    let setRulesCalled = 0;
    const deps = makeDeps({
      listFunctionIds: async () => ["classify"],
      setRules: async () => { setRulesCalled += 1; },
      getTestCases: async () => [{ id: "t1", inputMd: "x", expectedOutputMd: "{\"ok\":true}" }],
    });
    const report = await runAllFunctionsCoverage(deps, { aiEnabled: true, dryRun: false });
    assert.strictEqual(report.totalFunctions, 1);
    assert.strictEqual(report.functions[0]?.rules, "generated");
    assert.strictEqual(setRulesCalled, 1);
  });

  it("adds deterministic skip reason when expected output is missing", async () => {
    const deps = makeDeps({
      listFunctionIds: async () => ["summarize"],
      getRules: async () => [{ rule: "must", weight: 1 }],
      getTestCases: async () => [{ id: "t1", inputMd: "x" }],
    });
    const report = await runAllFunctionsCoverage(deps, { aiEnabled: true, dryRun: true });
    assert.strictEqual(report.functions[0]?.judged, "skipped");
    assert.ok(report.functions[0]?.skippedReasons.includes("NO_EXPECTED_OUTPUT"));
  });
});

describe("updateLibraryIndex CLI parser", () => {
  it("parses include-built-in and judge-after-index flags", () => {
    const parsed = parseUpdateLibraryIndexCliArgs([
      "--dry-run",
      "--include-built-in=false",
      "--judge-after-index",
      "--mode=strong",
    ]);
    assert.strictEqual(parsed.dryRun, true);
    assert.strictEqual(parsed.includeBuiltIn, false);
    assert.strictEqual(parsed.judgeAfterIndex, true);
    assert.strictEqual(parsed.mode, "strong");
  });
});
