/**
 * Scope-aware release: create and activate ScopeRelease for function + scope.
 */

import type { ContentResolver } from "nx-content";
import type { ScopeRelease } from "../content/scopedRuntime.js";
import { getSkillInstructions, getSkillRules } from "../content/skillsResolver.js";
import { getAppliedProfileSet } from "../content/appliedProfileStore.js";
import { saveScopeRelease, listScopeReleases, getScopeRelease } from "../content/scopeReleaseStore.js";
import { effectiveDefinitionHash } from "./hash.js";

export type CreateReleaseInput = {
  functionId: string;
  scopeId: string;
  /** Optional validation score at release time. */
  score?: number;
  /** Optional git/content ref. */
  ref?: string;
};

/**
 * Create a scope-specific release: snapshot effective definition + applied profile state.
 */
export async function createRelease(
  resolver: ContentResolver,
  input: CreateReleaseInput
): Promise<ScopeRelease> {
  const instruction = await getSkillInstructions(resolver, input.functionId);
  const rules = await getSkillRules(resolver, input.functionId);
  const effectiveDefinitionHashValue = effectiveDefinitionHash(instruction, rules);
  const applied = await getAppliedProfileSet(resolver, input.functionId, input.scopeId);

  const version = `v${new Date().toISOString().slice(0, 10)}.${Date.now()}`;
  const releasedAt = new Date().toISOString();

  const release: ScopeRelease = {
    functionId: input.functionId,
    scopeId: input.scopeId,
    version,
    releasedAt,
    score: input.score,
    ref: input.ref,
    instructionsSnapshot: instruction,
    rulesSnapshot: rules,
    effectiveDefinitionHash: effectiveDefinitionHashValue,
    appliedProfileSetId: applied?.id,
  };

  await saveScopeRelease(resolver, release);
  return release;
}

/**
 * List releases for function + scope.
 */
export async function getReleases(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string
): Promise<ScopeRelease[]> {
  return listScopeReleases(resolver, functionId, scopeId);
}

/**
 * Get a specific release by version for function + scope.
 */
export async function getRelease(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string,
  version: string
): Promise<ScopeRelease | null> {
  return getScopeRelease(resolver, functionId, scopeId, version);
}
