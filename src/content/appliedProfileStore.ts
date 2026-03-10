/**
 * Store for AppliedProfileSet per scope. Runtime resolves model from here when scopeId is set.
 * Transition: legacy getProfiles (function-root race-config) is used when no scope or no applied set.
 */

import type { ContentResolver } from "nx-content";
import { normalizeKeySegment } from "nx-content";
import type { AppliedProfileSet, ProfileKey } from "./scopedRuntime.js";
import type { RaceProfile } from "./raceStorage.js";
import { getProfiles } from "./raceStorage.js";

const SCOPE_PREFIX = "functions/";
const APPLIED_PROFILE_SUFFIX = "/applied-profile.json";

function appliedProfileKey(functionId: string, scopeId: string): string {
  const seg = normalizeKeySegment(functionId);
  return `${SCOPE_PREFIX}${seg}/scopes/${normalizeKeySegment(scopeId)}${APPLIED_PROFILE_SUFFIX}`;
}

/**
 * Read the applied profile set for a function and scope, if any.
 */
export async function getAppliedProfileSet(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string
): Promise<AppliedProfileSet | null> {
  const key = appliedProfileKey(functionId, scopeId);
  try {
    const raw = await resolver.get(key);
    const parsed = JSON.parse(typeof raw === "string" ? raw : "{}") as Partial<AppliedProfileSet>;
    if (parsed.functionId && parsed.scopeId && parsed.profiles) {
      return {
        id: parsed.id ?? "unknown",
        functionId: parsed.functionId,
        scopeId: parsed.scopeId,
        fromSessionId: parsed.fromSessionId,
        appliedAt: parsed.appliedAt ?? new Date(0).toISOString(),
        profiles: parsed.profiles,
        defaults: parsed.defaults,
      };
    }
  } catch {
    /* no applied profile for this scope */
  }
  return null;
}

/**
 * Write the applied profile set for a function and scope.
 */
export async function setAppliedProfileSet(
  resolver: ContentResolver,
  payload: AppliedProfileSet
): Promise<void> {
  const key = appliedProfileKey(payload.functionId, payload.scopeId);
  await resolver.set(key, JSON.stringify(payload, null, 2));
}

/**
 * Resolve effective profiles for runtime: applied set for scope if present, else legacy function-root profiles.
 */
export async function getEffectiveProfiles(
  resolver: ContentResolver,
  functionId: string,
  scopeId: string
): Promise<{ defaults?: { maxTokens?: number }; profiles: Partial<Record<ProfileKey, RaceProfile>> }> {
  const applied = await getAppliedProfileSet(resolver, functionId, scopeId);
  if (applied?.profiles) {
    return {
      defaults: applied.defaults,
      profiles: applied.profiles,
    };
  }
  const legacy = await getProfiles(resolver, functionId);
  return {
    defaults: legacy.defaults ?? undefined,
    profiles: legacy.profiles ?? {},
  };
}
