/**
 * ai.generate-judge-rules.v1 — derive JudgeRule[] from instructions (autonomy when rules missing).
 * STRONG only. See docs/FUNCTIONS_SPEC.md §9.
 */
import type { Client } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { JudgeRule, WeightScale } from "./types.js";

export type GenerateJudgeRulesRequest = {
  instructions: string;
  targetRuleCount?: number;
  weightScale?: WeightScale;
  includeFormatRules?: boolean;
  mode?: "strong";
  client?: Client;
  model?: string;
  report?: boolean;
};

export type GenerateJudgeRulesOutput = {
  schemaVersion: "ai.generate-judge-rules.v1";
  rules: JudgeRule[];
  extractedConstraints: string[];
  summary: string;
};

const SYSTEM = `Convert instructions into atomic, testable judge rules with weights.
Do NOT add new requirements—rules must be implied by instructions.
Stable ordering: format constraints first, then mandatory fields/structure, then core task.
Return JSON only.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM,
  normal: SYSTEM,
  strong: SYSTEM,
};

function buildPrompt(req: GenerateJudgeRulesRequest): string {
  return [
    "# ai.generate-judge-rules.v1",
    "",
    "## Instructions",
    "",
    req.instructions,
    "",
    "## Options",
    `- targetRuleCount: ${req.targetRuleCount ?? "undefined"}`,
    `- weightScale: ${req.weightScale ?? "1-5"}`,
    `- includeFormatRules: ${req.includeFormatRules ?? true}`,
  ].join("\n");
}

export async function generateJudgeRulesV1(
  request: GenerateJudgeRulesRequest
): Promise<GenerateJudgeRulesOutput> {
  const result = await executeSkill<GenerateJudgeRulesOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as GenerateJudgeRulesRequest),
    instructions: INSTRUCTIONS,
    client: request.client,
    mode: "strong",
    model: request.model,
  });
  return result;
}
