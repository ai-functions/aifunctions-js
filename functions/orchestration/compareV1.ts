/**
 * ai.compare.v1 — orchestration: rank 2+ responses by calling ai.judge.v1 for each.
 * No direct LLM call. See docs/FUNCTIONS_SPEC.md §6.
 */
import type { JudgeRule, JudgeOutput } from "../judge/types.js";
import { judgeV1 } from "../judge/judgeV1.js";
import { generateJudgeRulesV1 } from "../judge/generateJudgeRulesV1.js";
import { normalizeJudgeRules } from "../judge/normalizeJudgeRules.js";

export type CompareRequest = {
  instructions: string;
  responses: Array<{ id: string; text: string }>;
  rules?: JudgeRule[];
  threshold: number;
  mode?: "normal" | "strong";
  client?: import("../../src/index.js").Client;
  model?: string;
};

export type CompareOutput = {
  schemaVersion: "ai.compare.v1";
  ranking: Array<{ id: string; scoreNormalized: number; pass: boolean; lostPoints: number }>;
  bestId: string;
  candidates: Array<{ id: string; judge: JudgeOutput }>;
  summary: string;
};

async function resolveRules(
  instructions: string,
  request: CompareRequest
): Promise<JudgeRule[]> {
  let rules = request.rules ?? [];
  if (rules.length === 0) {
    const generated = await generateJudgeRulesV1({
      instructions,
      mode: "strong",
      client: request.client,
      model: request.model,
    });
    const normalized = normalizeJudgeRules({
      rules: generated.rules,
      weightScale: "1-5",
    });
    rules = normalized.rules;
  }
  return rules;
}

export async function compareV1(request: CompareRequest): Promise<CompareOutput> {
  const rules = await resolveRules(request.instructions, request);
  const judgeMode = request.mode === "strong" ? "strong" : "normal";

  const candidates: Array<{ id: string; judge: JudgeOutput }> = [];
  for (const r of request.responses) {
    const judge = await judgeV1(
      {
        instructions: request.instructions,
        response: r.text,
        rules,
        threshold: request.threshold,
        mode: judgeMode,
        client: request.client,
        model: request.model,
      },
      { rules }
    );
    candidates.push({ id: r.id, judge });
  }

  // Sort: scoreNormalized desc, lostPoints asc, stable by input order
  const sorted = [...candidates].sort((a, b) => {
    if (b.judge.scoreNormalized !== a.judge.scoreNormalized)
      return b.judge.scoreNormalized - a.judge.scoreNormalized;
    if (a.judge.lostPoints !== b.judge.lostPoints)
      return a.judge.lostPoints - b.judge.lostPoints;
    const aIdx = request.responses.findIndex((x) => x.id === a.id);
    const bIdx = request.responses.findIndex((x) => x.id === b.id);
    return aIdx - bIdx;
  });

  const ranking = sorted.map((c) => ({
    id: c.id,
    scoreNormalized: c.judge.scoreNormalized,
    pass: c.judge.pass,
    lostPoints: c.judge.lostPoints,
  }));
  const bestId = ranking[0]?.id ?? "";

  const summary = `Compared ${request.responses.length} responses. Best: ${bestId} (score ${ranking[0]?.scoreNormalized?.toFixed(2) ?? "n/a"}).`;

  return {
    schemaVersion: "ai.compare.v1",
    ranking,
    bestId,
    candidates,
    summary,
  };
}
