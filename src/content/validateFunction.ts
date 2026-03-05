/**
 * validateFunction — run schema + semantic quality checks for a content-based function.
 * Schema check: validates stored index examples against io.output (runFixtures).
 * Semantic check: runs stored test cases through the function, judges each output, aggregates score.
 * Writes lastValidation into skills/<id>/meta.json.
 */
import type { ContentResolver } from "nx-content";
import { runFixtures } from "./runFixtures.js";
import {
  getSkillTestCases,
  getFunctionMeta,
  setFunctionMeta,
  getSkillInstructions,
  getSkillRules,
} from "./skillsResolver.js";
import { runSkill } from "../../functions/router.js";
import { judgeV1 } from "../../functions/judge/judgeV1.js";
import type { JudgeRule } from "../../functions/judge/types.js";
import type { Client } from "../core/types.js";

export type ValidateFunctionCaseResult = {
  id: string;
  score: number;
  pass: boolean;
  error?: string;
};

export type ValidateFunctionResult = {
  schemaValid: boolean;
  schemaErrors: string[];
  scoreNormalized: number;
  passed: boolean;
  threshold: number;
  cases: ValidateFunctionCaseResult[];
};

export type ValidateFunctionOptions = {
  /** LLM client for running the function and judge calls. Default: createClient({ backend: "openrouter" }). */
  client?: Client;
};

/**
 * Run schema + semantic validation for a content-based function.
 * Returns { schemaValid, scoreNormalized, passed, threshold, cases }.
 * Also persists lastValidation into skills/<id>/meta.json.
 */
export async function validateFunction(
  resolver: ContentResolver,
  skillId: string,
  options?: ValidateFunctionOptions
): Promise<ValidateFunctionResult> {
  const meta = await getFunctionMeta(resolver, skillId);
  const threshold = meta.scoreGate ?? 0.85;

  // 1. Schema check via runFixtures (validates stored index examples against io.output)
  const fixturesReport = await runFixtures({ resolver, skillName: skillId });
  const schemaErrors = fixturesReport.results.flatMap((r) => r.errors ?? []);

  // 2. Load stored test cases
  const testCases = await getSkillTestCases(resolver, skillId);

  if (testCases.length === 0) {
    const scoreNormalized = fixturesReport.ok ? 1 : 0;
    const passed = fixturesReport.ok;
    await setFunctionMeta(resolver, skillId, {
      ...meta,
      lastValidation: { score: scoreNormalized, passed, runAt: new Date().toISOString() },
    });
    return {
      schemaValid: fixturesReport.ok,
      schemaErrors,
      scoreNormalized,
      passed,
      threshold,
      cases: [],
    };
  }

  // 3. Load instructions and rules for judging
  const instructions = await getSkillInstructions(resolver, skillId);
  const rules: JudgeRule[] = await getSkillRules(resolver, skillId);

  // 4. Run + judge each test case
  const cases: ValidateFunctionCaseResult[] = [];
  let totalScore = 0;

  for (const tc of testCases) {
    try {
      const runResult = await runSkill({
        key: skillId,
        mode: "strong",
        inputMd: tc.inputMd,
        resolver,
        client: options?.client,
      });
      const responseText =
        typeof runResult.data === "string"
          ? runResult.data
          : JSON.stringify(runResult.data);

      const judgeResult = await judgeV1({
        instructions,
        response: responseText,
        rules,
        threshold,
        mode: "strong",
        client: options?.client,
      });

      cases.push({ id: tc.id, score: judgeResult.scoreNormalized, pass: judgeResult.pass });
      totalScore += judgeResult.scoreNormalized;
    } catch (e) {
      cases.push({
        id: tc.id,
        score: 0,
        pass: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const scoreNormalized = cases.length > 0 ? totalScore / cases.length : 0;
  const passed = scoreNormalized >= threshold && fixturesReport.ok;

  // 5. Persist lastValidation into meta.json
  await setFunctionMeta(resolver, skillId, {
    ...meta,
    lastValidation: { score: scoreNormalized, passed, runAt: new Date().toISOString() },
  });

  return {
    schemaValid: fixturesReport.ok,
    schemaErrors,
    scoreNormalized,
    passed,
    threshold,
    cases,
  };
}
