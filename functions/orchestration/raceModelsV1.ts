/**
 * ai.race-models.v1 — orchestration: run many models on many test cases, judge each, rank.
 * Judge always strong. See docs/FUNCTIONS_SPEC.md §12.
 */
import { createClient, getModePreset } from "../../src/index.js";
import type { JudgeRule, JudgeOutput } from "../judge/types.js";
import { judgeV1 } from "../judge/judgeV1.js";
import { generateJudgeRulesV1 } from "../judge/generateJudgeRulesV1.js";
import { normalizeJudgeRules } from "../judge/normalizeJudgeRules.js";

export type RaceModelsRequest = {
  taskName: string;
  call: "ask" | "askJson";
  skill: { strongSystem: string; weakSystem?: string };
  testCases: Array<{ id: string; inputMd: string }>;
  judgeRules?: JudgeRule[];
  threshold: number;
  models: Array<{
    id: string;
    model: string;
    vendor?: string | string[];
    class: "weak" | "normal" | "strong";
    options?: { maxTokens?: number; temperature?: number; timeoutMs?: number };
  }>;
  client?: import("../../src/index.js").Client;
};

export type RaceModelsOutput = {
  schemaVersion: "ai.race-models.v1";
  ranking: Array<{
    modelId: string;
    avgScoreNormalized: number;
    passRate: number;
    avgLostPoints: number;
  }>;
  details: Array<{
    modelId: string;
    perTest: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }>;
  }>;
  bestModelId: string;
  summary: string;
};

async function resolveRules(
  skillSystem: string,
  request: RaceModelsRequest
): Promise<JudgeRule[]> {
  let rules = request.judgeRules ?? [];
  if (rules.length === 0) {
    const generated = await generateJudgeRulesV1({
      instructions: skillSystem,
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

function getSystemForClass(
  modelClass: "weak" | "normal" | "strong",
  skill: { strongSystem: string; weakSystem?: string }
): string {
  if (modelClass === "weak" && skill.weakSystem) return skill.weakSystem;
  return skill.strongSystem;
}

export async function raceModelsV1(
  request: RaceModelsRequest
): Promise<RaceModelsOutput> {
  const rules = await resolveRules(request.skill.strongSystem, request);
  const client = request.client ?? createClient({ backend: "openrouter" });

  const details: RaceModelsOutput["details"] = [];

  for (const modelCandidate of request.models) {
    const system = getSystemForClass(modelCandidate.class, request.skill);
    const preset = getModePreset(modelCandidate.class);
    const perTest: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }> = [];

    for (const testCase of request.testCases) {
      const opts = {
        system,
        model: modelCandidate.model,
        maxTokens: modelCandidate.options?.maxTokens ?? preset.maxTokens,
        temperature: modelCandidate.options?.temperature ?? preset.temperature,
        timeoutMs: modelCandidate.options?.timeoutMs,
        vendor: modelCandidate.vendor,
      };
      const res = await client.ask(testCase.inputMd, opts);
      const responseText = res.text?.trim() ?? "";

      const judge = await judgeV1(
        {
          instructions: system,
          response: responseText,
          rules,
          threshold: request.threshold,
          mode: "strong",
          client,
          model: modelCandidate.model,
        },
        { rules }
      );
      perTest.push({ testCaseId: testCase.id, responseText, judge });
    }

    details.push({ modelId: modelCandidate.id, perTest });
  }

  // Aggregate per-model: avgScoreNormalized, passRate, avgLostPoints
  const summaries = details.map((d) => {
    const n = d.perTest.length;
    const avgScoreNormalized =
      n > 0 ? d.perTest.reduce((s, t) => s + t.judge.scoreNormalized, 0) / n : 0;
    const passRate =
      n > 0 ? d.perTest.filter((t) => t.judge.pass).length / n : 0;
    const avgLostPoints =
      n > 0 ? d.perTest.reduce((s, t) => s + t.judge.lostPoints, 0) / n : 0;
    return {
      modelId: d.modelId,
      avgScoreNormalized,
      passRate,
      avgLostPoints,
    };
  });

  // Rank: avgScoreNormalized desc, passRate desc, avgLostPoints asc, stable
  const ranking = [...summaries].sort((a, b) => {
    if (b.avgScoreNormalized !== a.avgScoreNormalized)
      return b.avgScoreNormalized - a.avgScoreNormalized;
    if (b.passRate !== a.passRate) return b.passRate - a.passRate;
    if (a.avgLostPoints !== b.avgLostPoints)
      return a.avgLostPoints - b.avgLostPoints;
    const aIdx = request.models.findIndex((m) => m.id === a.modelId);
    const bIdx = request.models.findIndex((m) => m.id === b.modelId);
    return aIdx - bIdx;
  });

  const bestModelId = ranking[0]?.modelId ?? "";
  const summary = `Task: ${request.taskName}. Models: ${request.models.length}, tests: ${request.testCases.length}. Best: ${bestModelId}.`;

  return {
    schemaVersion: "ai.race-models.v1",
    ranking,
    details,
    bestModelId,
    summary,
  };
}
