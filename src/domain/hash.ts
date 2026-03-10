/**
 * Content hashes for effective definition and provenance.
 * Used on EvaluationSession, AppliedProfileSet, ScopeRelease.
 */

import { createHash } from "node:crypto";

/**
 * Compute a stable hash of effective definition (instructions + rules).
 * Used as effectiveDefinitionHash / contentFingerprint.
 */
export function effectiveDefinitionHash(instruction: string, rules: Array<{ rule: string; weight: number }> | unknown): string {
  const rulesStr = Array.isArray(rules)
    ? JSON.stringify(rules.map((r) => (typeof r === "object" && r !== null && "rule" in r ? (r as { rule: string }).rule : String(r))))
    : "";
  const payload = `${instruction}\n${rulesStr}`;
  return createHash("sha256").update(payload, "utf8").digest("hex").slice(0, 16);
}

/**
 * Hash of judge/rules for evaluation provenance.
 */
export function judgeRulesHash(rules: Array<{ rule: string; weight?: number }> | unknown): string {
  const arr = Array.isArray(rules) ? rules : [];
  const str = JSON.stringify(arr.map((r) => (typeof r === "object" && r !== null && "rule" in r ? (r as { rule: string }).rule : String(r))));
  return createHash("sha256").update(str, "utf8").digest("hex").slice(0, 16);
}
