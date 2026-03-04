/**
 * ai.optimize-instructions.v1 — one-shot: seed instructions + optional examples → optimized instructions, improved examples, judge rules.
 * STRONG only. See docs/FUNCTIONS_SPEC.md §14.
 */
import type { Client } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { JudgeRule, WeightScale } from "./types.js";

export type OptimizeInstructionsRequest = {
  seedInstructions: string;
  examples?: Array<{
    id: string;
    inputMd: string;
    outputs?: Array<{ id: string; text: string; label: "good" | "bad"; rationale?: string }>;
    notes?: string;
  }>;
  targetRuleCount?: number;
  weightScale?: WeightScale;
  includeFormatRules?: boolean;
  strictness?: "balanced" | "strict";
  mode?: "strong";
  client?: Client;
  model?: string;
  report?: boolean;
};

export type OptimizeInstructionsOutput = {
  schemaVersion: "ai.optimize-instructions.v1";
  optimizedInstructions: string;
  judgeRules: JudgeRule[];
  improvedExamples: Array<{
    id: string;
    inputMd: string;
    improvedGoodOutputs: Array<{ id: string; text: string; whyGood: string }>;
    improvedBadOutputs: Array<{ id: string; text: string; whyBad: string }>;
    extractedLessons: string[];
  }>;
  changes: Array<{
    kind: "add" | "rewrite" | "clarify" | "reorder" | "remove";
    description: string;
  }>;
  extractedConstraints: string[];
  summary: string;
};

const SYSTEM = `You are ai.optimize-instructions.v1.
Return ONLY JSON.
Improve clarity/enforceability without changing intent.
Use examples to tighten constraints and generate atomic judgeRules.
Make improvedGoodOutputs golden, improvedBadOutputs targeted failures with why.
No new requirements beyond what seed+examples imply.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM,
  normal: SYSTEM,
  strong: SYSTEM,
};

function buildPrompt(req: OptimizeInstructionsRequest): string {
  const examplesMd = req.examples
    ? req.examples
        .map((e) => {
          const outRaw = e.outputs
            ?.map(
              (o) =>
                `- [${o.label}] ${o.id}: ${o.text.slice(0, 200)}${o.rationale ? ` (rationale: ${o.rationale})` : ""}`
            )
            .join("\n");
          const out = outRaw ?? "";
          return `### ${e.id}\n${e.notes ?? ""}\nInput: ${e.inputMd.slice(0, 300)}...\nOutputs:\n${out}`;
        })
        .join("\n\n")
    : "None";
  return [
    "# ai.optimize-instructions.v1",
    "",
    "## Seed Instructions",
    "",
    req.seedInstructions,
    "",
    "## Examples (optional)",
    "",
    examplesMd,
    "",
    "## Options",
    `- targetRuleCount: ${req.targetRuleCount ?? "undefined"}`,
    `- weightScale: ${req.weightScale ?? "1-5"}`,
    `- includeFormatRules: ${req.includeFormatRules ?? true}`,
    `- strictness: ${req.strictness ?? "balanced"}`,
  ].join("\n");
}

export async function optimizeInstructionsV1(
  request: OptimizeInstructionsRequest
): Promise<OptimizeInstructionsOutput> {
  const result = await executeSkill<OptimizeInstructionsOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as OptimizeInstructionsRequest),
    instructions: INSTRUCTIONS,
    client: request.client,
    mode: "strong",
    model: request.model,
  });
  return result;
}
