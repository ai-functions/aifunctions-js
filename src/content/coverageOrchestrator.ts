export type CoverageRule = { rule: string; weight: number };
export type CoverageTestCase = { id: string; inputMd: string; expectedOutputMd?: string };

export type CoverageResultStatus = "existing" | "generated" | "judged" | "raced" | "skipped" | "failed";

export type FunctionCoverageStatus = {
  functionId: string;
  rules: CoverageResultStatus;
  examples: CoverageResultStatus;
  judged: CoverageResultStatus;
  raced: CoverageResultStatus;
  skippedReasons: string[];
  errors: string[];
};

export type CoverageReport = {
  generatedAt: string;
  totalFunctions: number;
  summary: {
    rulesGenerated: number;
    examplesGenerated: number;
    judged: number;
    raced: number;
    skipped: number;
    failed: number;
  };
  functions: FunctionCoverageStatus[];
};

export type CoverageDeps = {
  listFunctionIds(): Promise<string[]>;
  listContentFunctionIds(): Promise<string[]>;
  getRules(functionId: string): Promise<CoverageRule[]>;
  setRules(functionId: string, rules: CoverageRule[]): Promise<void>;
  getInstructions(functionId: string): Promise<string>;
  generateRules(functionId: string, instructions: string): Promise<CoverageRule[]>;
  getTestCases(functionId: string): Promise<CoverageTestCase[]>;
  /** Optional: generate test cases (good/bad examples) and validate good output against rules. */
  generateTestCases?(
    functionId: string,
    instructions: string,
    rules: CoverageRule[]
  ): Promise<{ testCases: CoverageTestCase[]; passRate: number }>;
  setTestCases?(functionId: string, testCases: CoverageTestCase[]): Promise<void>;
  judge(
    functionId: string,
    input: {
      instructions: string;
      response: string;
      rules: CoverageRule[];
      threshold: number;
    }
  ): Promise<{
    scoreNormalized: number;
    pass: boolean;
    failedRules?: string[];
    summary?: string;
  }>;
  setValidation(
    functionId: string,
    validation: { score: number; passed: boolean; runAt: string }
  ): Promise<void>;
  getRaceProfile(functionId: string): Promise<{ bestModel?: string }>;
  race(
    functionId: string,
    input: { instructions: string; testCases: CoverageTestCase[] }
  ): Promise<{
    bestModel: string;
    ranking?: Array<{ modelId: string; avgScore: number; passRate: number }>;
  } | null>;
  setRaceProfile(functionId: string, profile: { bestModel: string }): Promise<void>;
  finalizeArtifacts?(ctx: { aiEnabled: boolean; dryRun: boolean }): Promise<void>;
  /** Optional progress callback — called at each step so callers can log without coupling to console. */
  onProgress?(event: CoverageProgressEvent): void;
};

export type CoverageProgressEvent =
  | { type: "start"; functionId: string; index: number; total: number }
  | {
      type: "rules";
      functionId: string;
      result: CoverageResultStatus;
      detail?: string;
      /** First few generated rules, when result === "generated" */
      sampleRules?: Array<{ rule: string; weight: number }>;
    }
  | {
      type: "judge";
      functionId: string;
      result: CoverageResultStatus;
      score?: number;
      pass?: boolean;
      detail?: string;
      /** Rules that caused point deductions */
      failedRules?: string[];
      summary?: string;
    }
  | {
      type: "examples";
      functionId: string;
      result: CoverageResultStatus;
      count?: number;
      passRate?: number;
      detail?: string;
    }
  | {
      type: "race";
      functionId: string;
      result: CoverageResultStatus;
      bestModel?: string;
      detail?: string;
      /** Per-model ranking from the race */
      ranking?: Array<{ modelId: string; avgScore: number; passRate: number }>;
    }
  | { type: "finalize"; detail: string }
  | {
      type: "done";
      total: number;
      rulesGenerated: number;
      examplesGenerated: number;
      judged: number;
      raced: number;
      skipped: number;
      failed: number;
    };

export type CoverageOptions = {
  aiEnabled: boolean;
  dryRun?: boolean;
  threshold?: number;
  includeFunctionIds?: string[];
};

const ALIAS_TO_CANONICAL: Record<string, string> = {
  "ai.judge.v1": "judge",
  "ai.fix-instructions.v1": "fixInstructions",
  "ai.generate-rule.v1": "generateRule",
  "ai.generate-judge-rules.v1": "generateJudgeRules",
  "ai.optimize-instructions.v1": "optimizeInstructions",
  "ai.compare.v1": "compare",
  "ai.race-models.v1": "raceModels",
  "ai.generate-instructions.v1": "generateInstructions",
  "recordsMapper.collectionMapping.v1": "collectionMapping",
};

export function normalizeFunctionId(id: string): string {
  return ALIAS_TO_CANONICAL[id] ?? id;
}

export function dedupeFunctionIds(ids: string[]): string[] {
  const set = new Set<string>();
  for (const id of ids) set.add(normalizeFunctionId(id));
  return [...set];
}

function makeStatus(functionId: string): FunctionCoverageStatus {
  return {
    functionId,
    rules: "skipped",
    examples: "skipped",
    judged: "skipped",
    raced: "skipped",
    skippedReasons: [],
    errors: [],
  };
}

export async function runAllFunctionsCoverage(
  deps: CoverageDeps,
  options: CoverageOptions
): Promise<CoverageReport> {
  const dryRun = options.dryRun === true;
  const threshold = options.threshold ?? 0.8;
  const baseIds = options.includeFunctionIds?.length
    ? options.includeFunctionIds
    : [
      ...(await deps.listFunctionIds()),
      ...(await deps.listContentFunctionIds()),
    ];
  const functionIds = dedupeFunctionIds(baseIds);

  const emit = (e: CoverageProgressEvent) => deps.onProgress?.(e);
  const statuses: FunctionCoverageStatus[] = [];

  for (let i = 0; i < functionIds.length; i++) {
    const functionId = functionIds[i];
    const status = makeStatus(functionId);
    statuses.push(status);
    let activeRules: CoverageRule[] = [];
    let testCases: CoverageTestCase[] = [];
    let instructions = "";

    emit({ type: "start", functionId, index: i + 1, total: functionIds.length });

    try {
      activeRules = await deps.getRules(functionId);
      if (activeRules.length > 0) {
        status.rules = "existing";
        emit({ type: "rules", functionId, result: "existing", detail: `${activeRules.length} rules` });
      } else if (!options.aiEnabled) {
        status.rules = "skipped";
        status.skippedReasons.push("NO_LLM_CLIENT");
        emit({ type: "rules", functionId, result: "skipped", detail: "NO_LLM_CLIENT" });
      } else {
        instructions = await deps.getInstructions(functionId);
        if (!instructions.trim()) {
          status.rules = "skipped";
          status.skippedReasons.push("NO_INSTRUCTIONS");
          emit({ type: "rules", functionId, result: "skipped", detail: "NO_INSTRUCTIONS" });
        } else {
          emit({ type: "rules", functionId, result: "skipped", detail: "generating…" });
          const generated = await deps.generateRules(functionId, instructions);
          if (generated.length > 0) {
            if (!dryRun) await deps.setRules(functionId, generated);
            activeRules = generated;
            status.rules = "generated";
            emit({
              type: "rules",
              functionId,
              result: "generated",
              detail: `${generated.length} rules`,
              sampleRules: generated.slice(0, 3),
            });
          } else {
            status.rules = "failed";
            status.errors.push("RULE_GENERATION_EMPTY");
            emit({ type: "rules", functionId, result: "failed", detail: "RULE_GENERATION_EMPTY" });
          }
        }
      }
    } catch (e) {
      status.rules = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      status.errors.push(`RULES_ERROR: ${msg}`);
      emit({ type: "rules", functionId, result: "failed", detail: msg });
    }

    try {
      testCases = await deps.getTestCases(functionId);
      if (
        testCases.length === 0 &&
        options.aiEnabled &&
        activeRules.length > 0 &&
        deps.generateTestCases &&
        deps.setTestCases
      ) {
        if (!instructions) instructions = await deps.getInstructions(functionId);
        if (instructions.trim()) {
          emit({ type: "examples", functionId, result: "skipped", detail: "generating…" });
          const out = await deps.generateTestCases(functionId, instructions, activeRules);
          if (out.testCases.length > 0) {
            if (!dryRun) await deps.setTestCases(functionId, out.testCases);
            testCases = out.testCases;
            status.examples = "generated";
            emit({
              type: "examples",
              functionId,
              result: "generated",
              count: out.testCases.length,
              passRate: out.passRate,
              detail: `${out.testCases.length} cases, ${(out.passRate * 100).toFixed(0)}% passed validation`,
            });
          } else {
            status.examples = "failed";
            status.errors.push("EXAMPLES_GENERATION_EMPTY");
            emit({ type: "examples", functionId, result: "failed", detail: "EXAMPLES_GENERATION_EMPTY" });
          }
        } else {
          status.skippedReasons.push("NO_INSTRUCTIONS");
          emit({ type: "examples", functionId, result: "skipped", detail: "NO_INSTRUCTIONS" });
        }
      } else if (testCases.length > 0) {
        status.examples = "existing";
        emit({ type: "examples", functionId, result: "existing", detail: `${testCases.length} cases` });
      } else if (!options.aiEnabled) {
        status.skippedReasons.push("NO_LLM_CLIENT");
        emit({ type: "examples", functionId, result: "skipped", detail: "NO_LLM_CLIENT" });
      } else if (activeRules.length === 0) {
        emit({ type: "examples", functionId, result: "skipped", detail: "NO_RULES" });
      } else {
        emit({ type: "examples", functionId, result: "skipped", detail: "NO_GENERATE_DEP" });
      }
    } catch (e) {
      status.examples = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      status.errors.push(`EXAMPLES_ERROR: ${msg}`);
      emit({ type: "examples", functionId, result: "failed", detail: msg });
    }

    try {
      const withExpected = testCases.find((tc) => typeof tc.expectedOutputMd === "string" && tc.expectedOutputMd.trim().length > 0);
      if (!withExpected) {
        status.judged = "skipped";
        status.skippedReasons.push("NO_EXPECTED_OUTPUT");
        emit({ type: "judge", functionId, result: "skipped", detail: "NO_EXPECTED_OUTPUT" });
      } else if (activeRules.length === 0) {
        status.judged = "skipped";
        status.skippedReasons.push("NO_RULES");
        emit({ type: "judge", functionId, result: "skipped", detail: "NO_RULES" });
      } else if (!options.aiEnabled) {
        status.judged = "skipped";
        status.skippedReasons.push("NO_LLM_CLIENT");
        emit({ type: "judge", functionId, result: "skipped", detail: "NO_LLM_CLIENT" });
      } else {
        if (!instructions) instructions = await deps.getInstructions(functionId);
        emit({ type: "judge", functionId, result: "skipped", detail: "judging…" });
        const judged = await deps.judge(functionId, {
          instructions,
          response: withExpected.expectedOutputMd!,
          rules: activeRules,
          threshold,
        });
        if (!dryRun) {
          await deps.setValidation(functionId, {
            score: judged.scoreNormalized,
            passed: judged.pass,
            runAt: new Date().toISOString(),
          });
        }
        status.judged = "judged";
        emit({
          type: "judge",
          functionId,
          result: "judged",
          score: judged.scoreNormalized,
          pass: judged.pass,
          failedRules: judged.failedRules,
          summary: judged.summary,
        });
      }
    } catch (e) {
      status.judged = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      status.errors.push(`JUDGE_ERROR: ${msg}`);
      emit({ type: "judge", functionId, result: "failed", detail: msg });
    }

    try {
      const profile = await deps.getRaceProfile(functionId);
      if (profile.bestModel) {
        status.raced = "existing";
        emit({ type: "race", functionId, result: "existing", bestModel: profile.bestModel });
      } else if (!options.aiEnabled) {
        status.raced = "skipped";
        status.skippedReasons.push("NO_LLM_CLIENT");
        emit({ type: "race", functionId, result: "skipped", detail: "NO_LLM_CLIENT" });
      } else if (testCases.length === 0) {
        status.raced = "skipped";
        status.skippedReasons.push("NO_TEST_CASES");
        emit({ type: "race", functionId, result: "skipped", detail: "NO_TEST_CASES" });
      } else {
        if (!instructions) instructions = await deps.getInstructions(functionId);
        if (!instructions.trim()) {
          status.raced = "skipped";
          status.skippedReasons.push("NO_INSTRUCTIONS");
          emit({ type: "race", functionId, result: "skipped", detail: "NO_INSTRUCTIONS" });
        } else {
          emit({ type: "race", functionId, result: "skipped", detail: "racing…" });
          const raced = await deps.race(functionId, {
            instructions,
            testCases: testCases.slice(0, 3),
          });
          if (raced?.bestModel) {
            if (!dryRun) await deps.setRaceProfile(functionId, { bestModel: raced.bestModel });
            status.raced = "raced";
            emit({
              type: "race",
              functionId,
              result: "raced",
              bestModel: raced.bestModel,
              ranking: raced.ranking,
            });
          } else {
            status.raced = "failed";
            status.errors.push("RACE_EMPTY");
            emit({ type: "race", functionId, result: "failed", detail: "RACE_EMPTY" });
          }
        }
      }
    } catch (e) {
      status.raced = "failed";
      const msg = e instanceof Error ? e.message : String(e);
      status.errors.push(`RACE_ERROR: ${msg}`);
      emit({ type: "race", functionId, result: "failed", detail: msg });
    }
  }

  if (!dryRun && deps.finalizeArtifacts) {
    emit({ type: "finalize", detail: "rebuilding index and fallback artifacts…" });
    await deps.finalizeArtifacts({ aiEnabled: options.aiEnabled, dryRun });
    emit({ type: "finalize", detail: "done" });
  }

  const report: CoverageReport = {
    generatedAt: new Date().toISOString(),
    totalFunctions: statuses.length,
    summary: {
      rulesGenerated: statuses.filter((s) => s.rules === "generated").length,
      examplesGenerated: statuses.filter((s) => s.examples === "generated").length,
      judged: statuses.filter((s) => s.judged === "judged").length,
      raced: statuses.filter((s) => s.raced === "raced" || s.raced === "existing").length,
      skipped: statuses.filter((s) => s.skippedReasons.length > 0).length,
      failed: statuses.filter((s) => s.errors.length > 0).length,
    },
    functions: statuses,
  };
  return report;
}
