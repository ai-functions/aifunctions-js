/**
 * Runtime resolution: functionId + scopeId + profile → content + selected model.
 * Used by the main run path so execution is scope-aware and uses AppliedProfileSet when set.
 */

import type { ContentResolver } from "nx-content";
import type { FunctionContentProvider } from "./functionContentProvider.js";
import type { RuntimeResolutionInput, RuntimeResolution, ProfileKey } from "./scopedRuntime.js";
import { getEffectiveProfiles } from "./appliedProfileStore.js";
import { getProfiles } from "./raceStorage.js";
import { resolveSkillInstructions, getSkillRules, resolveSkillRules } from "./skillsResolver.js";

const PROFILE_KEYS: ProfileKey[] = ["best", "cheapest", "fastest", "balanced"];

function isProfileMode(mode: string): mode is ProfileKey {
  return PROFILE_KEYS.includes(mode as ProfileKey);
}

export type ResolveRuntimeOptions = {
  contentProvider?: FunctionContentProvider;
  resolver: ContentResolver;
  /** Instruction variant when not in profile mode: weak, normal, strong. */
  instructionMode?: "weak" | "normal" | "strong";
};

/**
 * Resolve runtime for execution: content (instruction, rules) plus selected model when profile is used.
 * Uses AppliedProfileSet for the given scope when available; otherwise falls back to legacy getProfiles at function root.
 */
export async function resolveRuntime(
  input: RuntimeResolutionInput & { mode?: string },
  options: ResolveRuntimeOptions
): Promise<RuntimeResolution> {
  const { contentProvider, resolver, instructionMode = "normal" } = options;
  const functionId = input.functionId;
  const scopeId = input.scopeId?.trim() || "default";
  const mode = input.mode ?? input.profile ?? "normal";
  const profileKey: ProfileKey | undefined = isProfileMode(mode) ? mode : undefined;

  let instruction: string;
  let rules: Array<{ rule: string; weight: number }>;

  if (contentProvider) {
    const content = await contentProvider.getFunctionContent({ functionId });
    const strength: "weak" | "normal" | "strong" = profileKey ? "normal" : instructionMode === "weak" ? "weak" : instructionMode === "strong" ? "strong" : "normal";
    instruction =
      (strength === "weak" && content.instructions?.weak) ||
      (strength === "strong" && content.instructions?.strong) ||
      content.instructions?.strong ||
      content.instructions?.weak ||
      content.instructions?.ultra ||
      "";
    rules = Array.isArray(content.rules) ? (content.rules as Array<{ rule: string; weight: number }>) : [];
  } else {
    const strength: "weak" | "normal" | "strong" = profileKey ? "normal" : instructionMode === "weak" ? "weak" : instructionMode === "strong" ? "strong" : "normal";
    instruction = await resolveSkillInstructions(resolver, functionId, strength);
    rules = await getSkillRules(resolver, functionId);
    if (rules.length === 0) rules = await resolveSkillRules(resolver, functionId);
  }

  if (profileKey) {
    const effective = scopeId === "default"
      ? await getProfiles(resolver, functionId)
      : await getEffectiveProfiles(resolver, functionId, scopeId);
    const profile = effective.profiles?.[profileKey];
    if (!profile?.model) {
      throw new Error(
        `No race profile for mode "${profileKey}" on function "${functionId}" (scope: ${scopeId}). Run an evaluation and apply a winner, or run a race first.`
      );
    }
    return {
      instruction,
      rules,
      model: profile.model,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
      scopeId,
      profile: profileKey,
    };
  }

  return {
    instruction,
    rules,
    scopeId,
  };
}
