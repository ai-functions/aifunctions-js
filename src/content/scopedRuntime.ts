/**
 * Scoped runtime model for Step 8: EvaluationSession, AppliedProfileSet, ScopeRelease.
 * Replaces flat shared race state with immutable, scope-tied artifacts.
 */

import type { RaceProfile, RaceProfileKey } from "./raceStorage.js";

/** Profile key for runtime selection (best, cheapest, fastest, balanced). */
export type ProfileKey = RaceProfileKey;

/** Immutable evaluation run: scope, corpus revision, content fingerprint, candidates. */
export interface EvaluationSession {
  sessionId: string;
  functionId: string;
  scopeId: string;
  /** Optional corpus/revision identifier (e.g. dataset version or content hash). */
  corpusRevisionId?: string;
  /** Content / effective definition hash at evaluation time. */
  effectiveDefinitionHash?: string;
  /** Judge/rules hash at evaluation time. */
  judgeRulesHash?: string;
  /** Legacy alias; prefer corpusRevisionId. */
  corpusRevision?: string;
  /** Content fingerprint at evaluation time (alias for effectiveDefinitionHash). */
  contentFingerprint?: string;
  /** Race type: model, temperature, tokens. */
  type: "model" | "temperature" | "tokens";
  label?: string;
  notes?: string;
  candidates: unknown;
  attempts: Array<{
    modelId?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    avgScoreNormalized?: number;
    passRate?: number;
    avgLostPoints?: number;
    latencyMs?: number;
    costSnapshot?: number | null;
  }>;
  /** Winner model ids per profile key. */
  winners: Partial<Record<ProfileKey, string>>;
  runAt: string;
  /** Optional attribution (e.g. userId). */
  createdBy?: string;
  summary?: string;
}

/** Immutable applied profile set for a scope: chosen models per profile key. */
export interface AppliedProfileSet {
  id: string;
  functionId: string;
  scopeId: string;
  /** Source evaluation session (optional). */
  fromSessionId?: string;
  /** Source corpus revision at apply time. */
  sourceCorpusRevisionId?: string;
  /** Effective definition hash at apply time. */
  effectiveDefinitionHash?: string;
  appliedAt: string;
  /** Optional attribution (e.g. userId). */
  appliedBy?: string;
  /** Effective profiles (best, cheapest, fastest, balanced). */
  profiles: Partial<Record<ProfileKey, RaceProfile>>;
  defaults?: { maxTokens?: number };
}

/** Scope-specific release: version tied to scope, not function root only. */
export interface ScopeRelease {
  scopeId: string;
  functionId: string;
  version: string;
  releasedAt: string;
  /** Optional validation score at release time. */
  score?: number;
  /** Git ref or content ref for this release. */
  ref?: string;
  /** Snapshot: effective instructions at release. */
  instructionsSnapshot?: string;
  /** Snapshot: effective rules at release. */
  rulesSnapshot?: unknown;
  /** Content/definition hash at release. */
  effectiveDefinitionHash?: string;
  /** Applied profile set id at release (if any). */
  appliedProfileSetId?: string;
}

/** Input to resolve runtime: function + scope + profile. */
export interface RuntimeResolutionInput {
  functionId: string;
  /** Scope for applied profile / release. Omit or "default" for legacy fallback. */
  scopeId?: string;
  /** Profile key (best, cheapest, fastest, balanced). When omitted, "best" is used for profile modes. */
  profile?: ProfileKey;
}

/** Resolved runtime: content plus selected model for execution. */
export interface RuntimeResolution {
  /** Resolved instruction text (normal/strong). */
  instruction: string;
  /** Resolved rules. */
  rules: Array<{ rule: string; weight: number }>;
  /** Selected model (when profile mode). */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** Effective content fingerprint (if available). */
  contentFingerprint?: string;
  /** Scope actually used (e.g. "default"). */
  scopeId: string;
  /** Profile key used. */
  profile?: ProfileKey;
}

/** Full resolved runtime from RuntimeResolutionService: execution uses content, selectedModel, effectiveContentFingerprint. */
export interface ResolvedRuntime {
  functionId: string;
  scopeId: string;
  /** Effective definition (instructions + rules) used for execution. */
  effectiveDefinition: { instruction: string; rules: Array<{ rule: string; weight: number }> };
  effectiveDefinitionHash: string;
  selectedProfile?: ProfileKey;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  appliedProfileSetId?: string;
  /** Content for execution (same as effectiveDefinition, for API clarity). */
  content: { instruction: string; rules: Array<{ rule: string; weight: number }> };
  effectiveContentFingerprint: string;
}
