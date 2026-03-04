/**
 * ai.fix-instructions.v1 — improve instructions given aggregated judge feedback.
 * STRONG only. See docs/FUNCTIONS_SPEC.md §7.
 */
import type { Client, LlmMode } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";

export type FixInstructionsRequest = {
  instructions: string;
  judgeFeedback: object;
  mode?: "strong";
  client?: Client;
  model?: string;
};

export type FixInstructionsOutput = {
  schemaVersion: "ai.fix-instructions.v1";
  fixedInstructions: string;
  changes: Array<{ kind: "add" | "rewrite" | "clarify" | "reorder"; description: string }>;
  addedRuleBullets: string[];
  summary: string;
};

const SYSTEM = `You are ai.fix-instructions.v1.
Return ONLY JSON.
Do not change intent. Make constraints clearer and more testable.
Use judgeFeedback focusRules/worstTests to fix the biggest failures first.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM,
  normal: SYSTEM,
  strong: SYSTEM,
};

function buildPrompt(req: FixInstructionsRequest): string {
  const judgeFeedbackJson = JSON.stringify(req.judgeFeedback, null, 2);
  return [
    "# ai.fix-instructions.v1",
    "",
    "## Original Instructions",
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

export async function fixInstructionsV1(
  request: FixInstructionsRequest
): Promise<FixInstructionsOutput> {
  const result = await executeSkill<FixInstructionsOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as FixInstructionsRequest),
    instructions: INSTRUCTIONS,
    client: request.client,
    mode: "strong",
    model: request.model,
  });
  return result;
}
