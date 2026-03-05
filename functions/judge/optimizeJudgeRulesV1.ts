/**
 * ai.optimize-judge-rules.v1 — edit existing judge rules using examples with rationale; append or replace.
 * STRONG only. When providing good/bad examples, include a brief rationale (why it's good or bad).
 */
import type { Client } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { JudgeRule, WeightScale } from "./types.js";

export type OptimizeJudgeRulesRequest = {
  existingRules: JudgeRule[];
  examples: Array<{
    id?: string;
    input?: string;
    output?: string;
    label: "good" | "bad";
    rationale: string;
  }>;
  /** "append" = merge new/updated rules with existing; "replace" = full new set. */
  ruleMode: "append" | "replace";
  instructions?: string;
  targetRuleCount?: number;
  weightScale?: WeightScale;
  client?: Client;
  model?: string;
};

export type OptimizeJudgeRulesOutput = {
  schemaVersion: "ai.optimize-judge-rules.v1";
  rules: JudgeRule[];
  changes?: {
    added: string[];
    removed: string[];
    modified: Array<{ before: string; after: string }>;
  };
  summary: string;
};

const SYSTEM = `You are ai.optimize-judge-rules.v1.
Return ONLY JSON (schema ai.optimize-judge-rules.v1).
Given existing judge rules and labeled examples (each with a rationale explaining why it's good or bad), revise the rules: add rules that capture missing constraints, remove or relax rules that conflict with good examples, and modify rules that need tightening from bad examples.
Rules must be atomic and testable. Use the requested mode: "replace" = output the full new rule set; "append" = merge new/updated rules with existing (keep existing unless contradicted by examples).
Include a changes summary (added, removed, modified) for transparency.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM,
  normal: SYSTEM,
  strong: SYSTEM,
};

function buildPrompt(req: OptimizeJudgeRulesRequest): string {
  const rulesMd = req.existingRules.map((r) => `- [${r.weight}] ${r.rule}`).join("\n");
  const examplesMd = req.examples
    .map(
      (e) =>
        `- [${e.label}] ${e.id ?? ""}: output: ${(e.output ?? "").slice(0, 200)}... (rationale: ${e.rationale})`
    )
    .join("\n");
  return [
    "# ai.optimize-judge-rules.v1",
    "",
    "## Existing Rules",
    "",
    rulesMd || "(none)",
    "",
    "## Examples (with rationale — why each is good or bad)",
    "",
    examplesMd,
    "",
    "## Rule mode (append | replace)",
    "",
    req.ruleMode,
    "",
    "## Options",
    req.instructions ? `Additional context:\n${req.instructions}\n` : "",
    `- targetRuleCount: ${req.targetRuleCount ?? "undefined"}`,
    `- weightScale: ${req.weightScale ?? "1-5"}`,
  ].join("\n");
}

export async function optimizeJudgeRulesV1(
  request: OptimizeJudgeRulesRequest
): Promise<OptimizeJudgeRulesOutput> {
  const result = await executeSkill<OptimizeJudgeRulesOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as OptimizeJudgeRulesRequest),
    instructions: INSTRUCTIONS,
    client: request.client,
    mode: "strong",
    model: request.model,
  });
  return result;
}
