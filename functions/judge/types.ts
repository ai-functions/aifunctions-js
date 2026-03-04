/**
 * Shared types for judge pipeline: ai.judge.v1, normalize-judge-rules, aggregate-judge-feedback, compare, etc.
 * See docs/FUNCTIONS_SPEC.md sections C, D, E.
 */

export type JudgeRule = { rule: string; weight: number };

export type JudgeRuleResult = {
  rule: string;
  weight: number;
  penalty: number;
  evidences: Array<{ evidence: string; source: "response" | "instruction"; note?: string }>;
  notes?: string;
};

export type JudgeOutput = {
  schemaVersion: "ai.judge.v1";
  pass: boolean;
  maxPoints: number;
  lostPoints: number;
  scorePoints: number;
  scoreNormalized: number;
  threshold: number;
  ruleResults: JudgeRuleResult[];
  failedRules: string[];
  summary: string;
};

export type WeightScale = "1-3" | "1-5" | "1-10";
