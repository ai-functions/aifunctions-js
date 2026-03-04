/**
 * ai.generate-rule.v1 — suggest instruction-rule strings to add (not judge rules).
 * STRONG only. See docs/FUNCTIONS_SPEC.md §8.
 */
import type { Client } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";

export type GenerateRuleRequest = {
  instructions: string;
  judgeFeedback: object;
  mode?: "strong";
  client?: Client;
  model?: string;
};

export type GenerateRuleOutput = {
  schemaVersion: "ai.generate-rule.v1";
  rulesToAdd: string[];
  rationale: string;
};

const SYSTEM = `Propose 3-8 short, testable instruction bullets to prevent failures in judgeFeedback.
No new intent; only enforce what is already implied.
Return JSON only.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM,
  normal: SYSTEM,
  strong: SYSTEM,
};

function buildPrompt(req: GenerateRuleRequest): string {
  const judgeFeedbackJson = JSON.stringify(req.judgeFeedback, null, 2);
  return [
    "# ai.generate-rule.v1",
    "",
    "## Instructions",
    "",
    req.instructions,
    "",
    "## Judge Feedback (JSON)",
    "",
    "```json",
    judgeFeedbackJson,
    "```",
  ].join("\n");
}

export async function generateRuleV1(
  request: GenerateRuleRequest
): Promise<GenerateRuleOutput> {
  const result = await executeSkill<GenerateRuleOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as GenerateRuleRequest),
    instructions: INSTRUCTIONS,
    client: request.client,
    mode: "strong",
    model: request.model,
  });
  return result;
}
