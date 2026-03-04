/**
 * ai.normalize-judge-rules.v1 — deterministic safety rail: sanitize, clamp weights, dedupe, cap count.
 * No LLM. See docs/FUNCTIONS_SPEC.md §10.
 */
import type { JudgeRule, WeightScale } from "./types.js";

export type NormalizeJudgeRulesRequest = {
  rules: JudgeRule[];
  weightScale: WeightScale;
  targetRuleCount?: number;
  maxRuleLength?: number;
  minRules?: number;
  maxRules?: number;
  report?: boolean;
};

export type NormalizeJudgeRulesOutput = {
  schemaVersion: "ai.normalize-judge-rules.v1";
  rules: JudgeRule[];
  dropped: Array<{ rule: string; reason: string }>;
  modified: Array<{ before: string; after: string; reason: string }>;
  summary: string;
};

const SCALE_MAX: Record<WeightScale, number> = {
  "1-3": 3,
  "1-5": 5,
  "1-10": 10,
};

function clampWeight(weight: number, scale: WeightScale): number {
  const max = SCALE_MAX[scale];
  const rounded = Math.round(weight);
  return Math.max(1, Math.min(max, rounded));
}

export function normalizeJudgeRules(
  request: NormalizeJudgeRulesRequest
): NormalizeJudgeRulesOutput {
  const {
    rules: inputRules,
    weightScale,
    targetRuleCount,
    maxRuleLength = 500,
    minRules = 0,
    maxRules = 50,
  } = request;
  const dropped: Array<{ rule: string; reason: string }> = [];
  const modified: Array<{ before: string; after: string; reason: string }> = [];

  // 1. Trim, collapse whitespace, drop empty
  let list: JudgeRule[] = inputRules
    .filter((r) => {
      const t = typeof r.rule === "string" ? r.rule.trim() : "";
      if (!t) {
        dropped.push({ rule: String(r.rule).slice(0, 80), reason: "empty after trim" });
        return false;
      }
      return true;
    })
    .map((r) => ({
      rule: (r.rule as string).replace(/\s+/g, " ").trim(),
      weight: typeof r.weight === "number" ? r.weight : 1,
    }));

  // 2. Truncate by maxRuleLength and record modifications
  list = list.map((r) => {
    if (r.rule.length <= maxRuleLength) return r;
    const after = r.rule.slice(0, maxRuleLength).trim();
    modified.push({
      before: r.rule,
      after,
      reason: `truncated to ${maxRuleLength} chars`,
    });
    return { rule: after, weight: r.weight };
  });

  // 3. Normalize weight to scale
  const maxW = SCALE_MAX[weightScale];
  list = list.map((r) => {
    const w = clampWeight(r.weight, weightScale);
    if (w !== r.weight) {
      modified.push({
        before: r.rule,
        after: r.rule,
        reason: `weight clamped from ${r.weight} to ${w} (scale 1-${maxW})`,
      });
      return { rule: r.rule, weight: w };
    }
    return r;
  });

  // 4. Dedupe by case-insensitive rule text: keep highest weight, tie → first seen
  const byKey = new Map<string, JudgeRule>();
  for (const r of list) {
    const key = r.rule.toLowerCase();
    const existing = byKey.get(key);
    if (!existing || r.weight > existing.weight) {
      byKey.set(key, r);
    } else {
      dropped.push({ rule: r.rule, reason: "duplicate (lower or equal weight)" });
    }
  }
  list = [...byKey.values()];

  // 5. Sort by weight desc, then rule asc; cap count
  list.sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.rule.localeCompare(b.rule);
  });
  const cap = targetRuleCount ?? maxRules;
  if (list.length > cap) {
    const removed = list.slice(cap);
    list = list.slice(0, cap);
    for (const r of removed) {
      dropped.push({ rule: r.rule, reason: "exceeded targetRuleCount/maxRules" });
    }
  }

  // 6. Ensure minRules (optional: we don't add generic rules; we just report if below min)
  const summaryParts: string[] = [
    `Input: ${inputRules.length} rules. Output: ${list.length} rules.`,
    `Dropped: ${dropped.length}. Modified: ${modified.length}.`,
  ];
  if (minRules > 0 && list.length < minRules) {
    summaryParts.push(`Warning: below minRules (${minRules}).`);
  }

  return {
    schemaVersion: "ai.normalize-judge-rules.v1",
    rules: list,
    dropped,
    modified,
    summary: summaryParts.join(" "),
  };
}
