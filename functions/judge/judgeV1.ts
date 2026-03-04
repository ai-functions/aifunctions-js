/**
 * ai.judge.v1 — score pass/fail using weighted rules; include evidences; partial penalties allowed.
 * Modes: normal / strong (spec recommends strong when evaluating others). See docs/FUNCTIONS_SPEC.md §5.
 */
import type { Client, LlmMode } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { JudgeRule, JudgeOutput } from "./types.js";

export type JudgeRequest = {
  instructions: string;
  response: string;
  rules: JudgeRule[];
  threshold: number;
  mode?: "normal" | "strong";
  client?: Client;
  model?: string;
};

const SYSTEM_NORMAL = `You are ai.judge.v1.
Return ONLY JSON (schema ai.judge.v1). No extra text.
Each rule weight is MAX points that can be lost. penalty in [0..weight] (partial allowed).
If penalty>0, include at least 1 evidence snippet (short exact quote).
Compute scoreNormalized = (maxPoints-lostPoints)/maxPoints (or 1 if maxPoints=0).
pass if scoreNormalized >= threshold.
Do not add requirements outside the given rules.`;

const SYSTEM_STRONG = `You are ai.judge.v1.
Return ONLY JSON (schema ai.judge.v1). No extra text.
Each rule weight is MAX points that can be lost. penalty in [0..weight] (partial allowed).
If penalty>0, include at least 1 evidence snippet (short exact quote).
Compute scoreNormalized = (maxPoints-lostPoints)/maxPoints (or 1 if maxPoints=0).
pass if scoreNormalized >= threshold.
Do not add requirements outside the given rules.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM_NORMAL,
  normal: SYSTEM_NORMAL,
  strong: SYSTEM_STRONG,
};

function buildPrompt(req: JudgeRequest): string {
  const rulesMd = req.rules.map((r) => `- [${r.weight}] ${r.rule}`).join("\n");
  return [
    "# ai.judge.v1",
    "",
    "## Instructions",
    "",
    req.instructions,
    "",
    "## Response",
    "",
    req.response,
    "",
    "## Rules",
    "",
    rulesMd,
    "",
    "## Threshold",
    "",
    String(req.threshold),
  ].join("\n");
}

export async function judgeV1(
  request: JudgeRequest,
  opts?: { rules?: JudgeRule[] }
): Promise<JudgeOutput> {
  const mode: LlmMode = request.mode === "strong" ? "strong" : "normal";
  const result = await executeSkill<JudgeOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as JudgeRequest),
    instructions: INSTRUCTIONS,
    rules: opts?.rules,
    client: request.client,
    mode,
    model: request.model,
  });
  return result;
}
