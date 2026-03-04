/**
 * ai.generate-instructions.v1 — orchestration loop: run model → judge → aggregate → fix/generate-rule until threshold or max cycles.
 * Judge always strong. See docs/FUNCTIONS_SPEC.md §13.
 */
import { createClient, getModePreset } from "../../src/index.js";
import type { JudgeRule, JudgeOutput } from "../judge/types.js";
import { judgeV1 } from "../judge/judgeV1.js";
import { aggregateJudgeFeedback } from "../judge/aggregateJudgeFeedback.js";
import { generateJudgeRulesV1 } from "../judge/generateJudgeRulesV1.js";
import { normalizeJudgeRules } from "../judge/normalizeJudgeRules.js";
import { generateRuleV1 } from "../judge/generateRuleV1.js";
import { fixInstructionsV1 } from "../judge/fixInstructionsV1.js";

export type GenerateInstructionsRequest = {
  seedInstructions: string;
  testCases: Array<{ id: string; inputMd: string }>;
  call: "ask" | "askJson";
  targetModel: {
    model: string;
    vendor?: string | string[];
    class: "weak" | "normal" | "strong";
    options?: { maxTokens?: number; temperature?: number };
  };
  judgeRules?: JudgeRule[];
  judgeThreshold: number;
  targetAverageThreshold: number;
  loop: {
    maxCycles: number;
    forceContinueAfterPass?: boolean;
    patienceCycles?: number;
    minDeltaToCount?: number;
  };
  optimizer: { mode: "strong" };
  client?: import("../../src/index.js").Client;
  report?: boolean;
};

export type GenerateInstructionsOutput = {
  schemaVersion: "ai.generate-instructions.v1";
  achieved: boolean;
  cyclesRun: number;
  best: { instructions: string; avgScoreNormalized: number; passRate: number };
  final: { instructions: string; avgScoreNormalized: number; passRate: number };
  history: Array<{
    cycle: number;
    instructions: string;
    perTest: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }>;
    avgScoreNormalized: number;
    passRate: number;
    avgLostPoints: number;
    improvements?: {
      generatedRulesToAdd?: string[];
      fixChanges?: Array<{ kind: string; description: string }>;
    };
  }>;
  summary: string;
};

async function resolveRules(
  instructions: string,
  request: GenerateInstructionsRequest
): Promise<JudgeRule[]> {
  let rules = request.judgeRules ?? [];
  if (rules.length === 0) {
    const generated = await generateJudgeRulesV1({
      instructions,
      mode: "strong",
      client: request.client,
    });
    const normalized = normalizeJudgeRules({
      rules: generated.rules,
      weightScale: "1-5",
    });
    rules = normalized.rules;
  }
  return rules;
}

function mergeInstructions(
  fixedInstructions: string,
  rulesToAdd: string[]
): string {
  if (!rulesToAdd.length) return fixedInstructions;
  const bullets = rulesToAdd.map((r) => `- ${r}`).join("\n");
  return `${fixedInstructions.trim()}\n\n## Additional rules to follow\n${bullets}`;
}

export async function generateInstructionsV1(
  request: GenerateInstructionsRequest
): Promise<GenerateInstructionsOutput> {
  const client = request.client ?? createClient({ backend: "openrouter" });
  const preset = getModePreset(request.targetModel.class);
  const {
    targetAverageThreshold,
    loop: {
      maxCycles,
      forceContinueAfterPass = false,
      patienceCycles,
      minDeltaToCount = 0,
    },
  } = request;

  let instructions = request.seedInstructions;
  let rules = await resolveRules(instructions, request);

  let best: { instructions: string; avgScoreNormalized: number; passRate: number } | null = null;
  let noImproveStreak = 0;
  const history: GenerateInstructionsOutput["history"] = [];

  for (let cycle = 1; cycle <= maxCycles; cycle++) {
    // Run model on test suite
    const perTest: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }> = [];
    for (const testCase of request.testCases) {
      const opts = {
        system: instructions,
        model: request.targetModel.model,
        maxTokens: request.targetModel.options?.maxTokens ?? preset.maxTokens,
        temperature: request.targetModel.options?.temperature ?? preset.temperature,
        vendor: request.targetModel.vendor,
      };
      const res = await client.ask(testCase.inputMd, opts);
      const responseText = res.text?.trim() ?? "";
      const judge = await judgeV1(
        {
          instructions,
          response: responseText,
          rules,
          threshold: request.judgeThreshold,
          mode: "strong",
          client,
          model: request.targetModel.model,
        },
        { rules }
      );
      perTest.push({ testCaseId: testCase.id, responseText, judge });
    }

    const avgScoreNormalized =
      perTest.length > 0
        ? perTest.reduce((s, t) => s + t.judge.scoreNormalized, 0) / perTest.length
        : 0;
    const passRate =
      perTest.length > 0
        ? perTest.filter((t) => t.judge.pass).length / perTest.length
        : 0;
    const avgLostPoints =
      perTest.length > 0
        ? perTest.reduce((s, t) => s + t.judge.lostPoints, 0) / perTest.length
        : 0;

    // Update best
    if (
      best === null ||
      avgScoreNormalized > best.avgScoreNormalized + minDeltaToCount
    ) {
      best = { instructions, avgScoreNormalized, passRate };
      noImproveStreak = 0;
    } else {
      noImproveStreak++;
    }

    const historyEntry: (typeof history)[0] = {
      cycle,
      instructions,
      perTest,
      avgScoreNormalized,
      passRate,
      avgLostPoints,
    };

    // Stop conditions
    if (
      avgScoreNormalized >= targetAverageThreshold &&
      !forceContinueAfterPass
    ) {
      historyEntry.improvements = {};
      history.push(historyEntry);
      return {
        schemaVersion: "ai.generate-instructions.v1",
        achieved: true,
        cyclesRun: cycle,
        best: best!,
        final: { instructions, avgScoreNormalized, passRate },
        history,
        summary: `Achieved target ${targetAverageThreshold} in ${cycle} cycles.`,
      };
    }
    if (patienceCycles != null && noImproveStreak >= patienceCycles) {
      history.push(historyEntry);
      return {
        schemaVersion: "ai.generate-instructions.v1",
        achieved: false,
        cyclesRun: cycle,
        best: best!,
        final: { instructions, avgScoreNormalized, passRate },
        history,
        summary: `Stalled after ${patienceCycles} cycles without improvement.`,
      };
    }
    if (cycle === maxCycles) {
      history.push(historyEntry);
      return {
        schemaVersion: "ai.generate-instructions.v1",
        achieved: avgScoreNormalized >= targetAverageThreshold,
        cyclesRun: cycle,
        best: best!,
        final: { instructions, avgScoreNormalized, passRate },
        history,
        summary: `Stopped at maxCycles=${maxCycles}.`,
      };
    }

    // Build optimizer feedback
    const agg = aggregateJudgeFeedback({
      instructions,
      rules,
      threshold: request.judgeThreshold,
      tests: perTest.map((t) => ({
        testCaseId: t.testCaseId,
        responseText: t.responseText,
        judge: t.judge,
      })),
    });

    const [rulesToAddResult, fixedResult] = await Promise.all([
      generateRuleV1({ instructions, judgeFeedback: agg, mode: "strong", client }),
      fixInstructionsV1({ instructions, judgeFeedback: agg, mode: "strong", client }),
    ]);

    historyEntry.improvements = {
      generatedRulesToAdd: rulesToAddResult.rulesToAdd,
      fixChanges: fixedResult.changes.map((c) => ({ kind: c.kind, description: c.description })),
    };
    history.push(historyEntry);

    instructions = mergeInstructions(
      fixedResult.fixedInstructions,
      rulesToAddResult.rulesToAdd
    );
  }

  return {
    schemaVersion: "ai.generate-instructions.v1",
    achieved: false,
    cyclesRun: maxCycles,
    best: best!,
    final: {
      instructions,
      avgScoreNormalized: history[history.length - 1]?.avgScoreNormalized ?? 0,
      passRate: history[history.length - 1]?.passRate ?? 0,
    },
    history,
    summary: `Completed ${maxCycles} cycles.`,
  };
}
