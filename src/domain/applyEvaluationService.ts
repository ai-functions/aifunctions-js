/**
 * Apply evaluation: create immutable AppliedProfileSet from an EvaluationSession.
 * Evaluation creates evidence; apply changes runtime behavior.
 */

import type { ContentResolver } from "nx-content";
import type { AppliedProfileSet, ProfileKey } from "../content/scopedRuntime.js";
import type { RaceProfile } from "../content/raceStorage.js";
import { getEvaluationSession } from "../content/evaluationSessionStore.js";
import { setAppliedProfileSet } from "../content/appliedProfileStore.js";
import { randomUUID } from "node:crypto";

export type ApplyEvaluationInput = {
  evaluationSessionId: string;
  functionId: string;
  scopeId: string;
  /** Optional attribution. */
  appliedBy?: string;
};

/**
 * Create AppliedProfileSet from an evaluation session and persist for the scope.
 * Runtime will then resolve profile from this set for the scope.
 */
export async function applyEvaluation(
  resolver: ContentResolver,
  input: ApplyEvaluationInput
): Promise<AppliedProfileSet> {
  const session = await getEvaluationSession(resolver, input.functionId, input.scopeId, input.evaluationSessionId);
  if (!session) {
    throw new Error(`Evaluation session not found: ${input.evaluationSessionId} (function: ${input.functionId}, scope: ${input.scopeId})`);
  }

  const candidates = session.candidates as { models?: Array<{ id: string; model: string; options?: { maxTokens?: number; temperature?: number } }> } | undefined;
  const models = candidates?.models ?? [];
  const attempts = session.attempts ?? [];

  const profileFromWinner = (key: ProfileKey): RaceProfile | undefined => {
    const winnerId = session.winners?.[key];
    if (!winnerId) return undefined;
    const candidate = models.find((m: { id: string }) => m.id === winnerId) as { id: string; model: string; options?: { maxTokens?: number; temperature?: number } } | undefined;
    if (!candidate) return undefined;
    return {
      model: candidate.model,
      temperature: candidate.options?.temperature,
      maxTokens: candidate.options?.maxTokens,
    };
  };

  const profiles: Partial<Record<ProfileKey, RaceProfile>> = {};
  for (const key of ["best", "cheapest", "fastest", "balanced"] as ProfileKey[]) {
    const p = profileFromWinner(key);
    if (p) profiles[key] = p;
  }
  if (Object.keys(profiles).length === 0) {
    const best = profileFromWinner("best");
    if (best) {
      profiles.best = profiles.cheapest = profiles.fastest = profiles.balanced = best;
    }
  }

  const appliedAt = new Date().toISOString();
  const payload: AppliedProfileSet = {
    id: randomUUID(),
    functionId: input.functionId,
    scopeId: input.scopeId,
    fromSessionId: session.sessionId,
    sourceCorpusRevisionId: session.corpusRevisionId ?? session.corpusRevision,
    effectiveDefinitionHash: session.effectiveDefinitionHash ?? session.contentFingerprint,
    appliedAt,
    appliedBy: input.appliedBy,
    profiles,
  };

  await setAppliedProfileSet(resolver, payload);
  return payload;
}
