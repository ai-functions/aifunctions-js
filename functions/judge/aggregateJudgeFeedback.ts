/**
 * ai.aggregate-judge-feedback.v1 — deterministic: combine many JudgeOutputs into one feedback object for optimizers.
 * No LLM. See docs/FUNCTIONS_SPEC.md §11.
 */
import type { JudgeOutput, JudgeRule } from "./types.js";

export type AggregateJudgeFeedbackRequest = {
  instructions: string;
  rules?: JudgeRule[];
  threshold: number;
  tests: Array<{ testCaseId: string; responseText: string; judge: JudgeOutput }>;
  keepTopRules?: number;
  keepWorstTests?: number;
  maxEvidencesPerRule?: number;
};

export type RuleStatEvidence = {
  testCaseId: string;
  evidence: string;
  source: "response" | "instruction";
  note?: string;
};

export type RuleStat = {
  rule: string;
  weight: number;
  triggerCount: number;
  triggerRate: number;
  totalPenalty: number;
  avgPenalty: number;
  avgPenaltyWhenTriggered: number;
  evidences: RuleStatEvidence[];
};

export type WorstTest = {
  testCaseId: string;
  scoreNormalized: number;
  lostPoints: number;
  failedRules: string[];
  evidenceSnippets: Array<{ rule: string; evidence: string }>;
};

export type AggregateJudgeFeedbackOutput = {
  schemaVersion: "ai.judge-feedback.aggregate.v1";
  threshold: number;
  testCount: number;
  passCount: number;
  passRate: number;
  avgScoreNormalized: number;
  avgLostPoints: number;
  ruleStats: RuleStat[];
  focusRules: string[];
  worstTests: WorstTest[];
  summary: string;
};

const DEFAULT_TOP_RULES = 10;
const DEFAULT_WORST_TESTS = 5;
const DEFAULT_MAX_EVIDENCES_PER_RULE = 3;

function normalizeEvidenceText(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

export function aggregateJudgeFeedback(
  request: AggregateJudgeFeedbackRequest
): AggregateJudgeFeedbackOutput {
  const {
    threshold,
    tests,
    keepTopRules = DEFAULT_TOP_RULES,
    keepWorstTests = DEFAULT_WORST_TESTS,
    maxEvidencesPerRule = DEFAULT_MAX_EVIDENCES_PER_RULE,
  } = request;

  const testCount = tests.length;
  const passCount = tests.filter((t) => t.judge.pass).length;
  const passRate = testCount > 0 ? passCount / testCount : 0;
  const avgScoreNormalized =
    testCount > 0
      ? tests.reduce((s, t) => s + t.judge.scoreNormalized, 0) / testCount
      : 0;
  const avgLostPoints =
    testCount > 0
      ? tests.reduce((s, t) => s + t.judge.lostPoints, 0) / testCount
      : 0;

  // Collect per-rule stats: rule -> { weight, triggerCount, totalPenalty, evidences[] }
  const ruleMap = new Map<
    string,
    {
      weight: number;
      triggerCount: number;
      totalPenalty: number;
      evidences: Array<{ testCaseId: string; evidence: string; source: "response" | "instruction"; note?: string }>;
    }
  >();

  for (const { testCaseId, judge } of tests) {
    for (const rr of judge.ruleResults) {
      const key = rr.rule;
      let entry = ruleMap.get(key);
      if (!entry) {
        entry = {
          weight: rr.weight,
          triggerCount: 0,
          totalPenalty: 0,
          evidences: [],
        };
        ruleMap.set(key, entry);
      }
      if (rr.penalty > 0) {
        entry.triggerCount += 1;
        entry.totalPenalty += rr.penalty;
        for (const ev of rr.evidences) {
          entry.evidences.push({
            testCaseId,
            evidence: ev.evidence,
            source: ev.source,
            note: ev.note,
          });
        }
      }
    }
  }

  // Dedupe evidences by normalized text + source; sort by (test penalty desc, testCaseId, evidence); take N
  const ruleStats: RuleStat[] = [];
  for (const [rule, entry] of ruleMap) {
    const seen = new Set<string>();
    const deduped = entry.evidences.filter((e) => {
      const norm = normalizeEvidenceText(e.evidence) + "|" + e.source;
      if (seen.has(norm)) return false;
      seen.add(norm);
      return true;
    });
    // Sort by testCaseId then evidence; then take maxEvidencesPerRule
    deduped.sort((a, b) => {
      const c = a.testCaseId.localeCompare(b.testCaseId);
      if (c !== 0) return c;
      return a.evidence.localeCompare(b.evidence);
    });
    const evidences = deduped.slice(0, maxEvidencesPerRule);
    const avgPenaltyWhenTriggered =
      entry.triggerCount > 0 ? entry.totalPenalty / entry.triggerCount : 0;
    ruleStats.push({
      rule,
      weight: entry.weight,
      triggerCount: entry.triggerCount,
      triggerRate: testCount > 0 ? entry.triggerCount / testCount : 0,
      totalPenalty: entry.totalPenalty,
      avgPenalty: testCount > 0 ? entry.totalPenalty / testCount : 0,
      avgPenaltyWhenTriggered,
      evidences,
    });
  }

  // Sort rules by impact: totalPenalty desc, triggerRate desc, weight desc, rule asc
  ruleStats.sort((a, b) => {
    if (b.totalPenalty !== a.totalPenalty) return b.totalPenalty - a.totalPenalty;
    if (b.triggerRate !== a.triggerRate) return b.triggerRate - a.triggerRate;
    if (b.weight !== a.weight) return b.weight - a.weight;
    return a.rule.localeCompare(b.rule);
  });
  const focusRules = ruleStats.slice(0, keepTopRules).map((r) => r.rule);

  // Worst tests: sort by scoreNormalized asc, then lostPoints desc, then testCaseId asc
  const sortedTests = [...tests].sort((a, b) => {
    if (a.judge.scoreNormalized !== b.judge.scoreNormalized)
      return a.judge.scoreNormalized - b.judge.scoreNormalized;
    if (b.judge.lostPoints !== a.judge.lostPoints)
      return b.judge.lostPoints - a.judge.lostPoints;
    return a.testCaseId.localeCompare(b.testCaseId);
  });
  const worstTests: WorstTest[] = sortedTests.slice(0, keepWorstTests).map((t) => {
    const evidenceSnippets: Array<{ rule: string; evidence: string }> = [];
    for (const rr of t.judge.ruleResults) {
      if (rr.penalty > 0 && rr.evidences.length > 0) {
        evidenceSnippets.push({ rule: rr.rule, evidence: rr.evidences[0].evidence });
      }
    }
    return {
      testCaseId: t.testCaseId,
      scoreNormalized: t.judge.scoreNormalized,
      lostPoints: t.judge.lostPoints,
      failedRules: t.judge.failedRules,
      evidenceSnippets,
    };
  });

  const summary = `Tests: ${testCount}, pass: ${passCount}, passRate: ${(passRate * 100).toFixed(1)}%, avgScore: ${(avgScoreNormalized * 100).toFixed(1)}%, focusRules: ${focusRules.length}, worstTests: ${worstTests.length}.`;

  return {
    schemaVersion: "ai.judge-feedback.aggregate.v1",
    threshold,
    testCount,
    passCount,
    passRate,
    avgScoreNormalized,
    avgLostPoints,
    ruleStats,
    focusRules,
    worstTests,
    summary,
  };
}
