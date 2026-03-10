/**
 * Runtime resolution service: function + scope + profile → full resolved runtime.
 * Execution uses runtime.content, runtime.selectedModel, runtime.effectiveContentFingerprint.
 * Never uses root race-config/races as primary truth; uses applied profile set for scope (with legacy fallback only in store layer).
 */

import type { ContentResolver } from "nx-content";
import type { FunctionContentProvider } from "../content/functionContentProvider.js";
import type { ResolvedRuntime, RuntimeResolutionInput, ProfileKey } from "../content/scopedRuntime.js";
import { getEffectiveProfiles } from "../content/appliedProfileStore.js";
import { getAppliedProfileSet } from "../content/appliedProfileStore.js";
import { resolveSkillInstructions, getSkillRules, resolveSkillRules } from "../content/skillsResolver.js";
import { effectiveDefinitionHash } from "./hash.js";

const PROFILE_KEYS: ProfileKey[] = ["best", "cheapest", "fastest", "balanced"];

function isProfileKey(m: string): m is ProfileKey {
  return PROFILE_KEYS.includes(m as ProfileKey);
}

export type RuntimeResolutionServiceOptions = {
  resolver: ContentResolver;
  contentProvider?: FunctionContentProvider;
  /** Instruction variant when not in profile mode. */
  instructionMode?: "weak" | "normal" | "strong";
};

/**
 * Resolve full runtime for execution. Default scope is "default" when scopeId missing; no silent fallback to old flat files as primary (store layer may fall back for default scope when no applied set).
 */
export async function resolve(params: {
  functionId: string;
  scopeId?: string;
  profile?: ProfileKey;
  /** Optional explicit model override (override only, not primary routing). */
  modelOverride?: string;
  mode?: string;
}, options: RuntimeResolutionServiceOptions): Promise<ResolvedRuntime> {
  const { resolver, contentProvider, instructionMode = "normal" } = options;
  const functionId = params.functionId;
  const scopeId = params.scopeId?.trim() || "default";
  const mode = params.mode ?? params.profile ?? "normal";
  const profileKey: ProfileKey | undefined = isProfileKey(mode) ? mode : undefined;

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

  const effectiveDefinition = { instruction, rules };
  const effectiveDefinitionHashValue = effectiveDefinitionHash(instruction, rules);

  let selectedModel: string | undefined;
  let temperature: number | undefined;
  let maxTokens: number | undefined;
  let appliedProfileSetId: string | undefined;

  if (params.modelOverride?.trim()) {
    selectedModel = params.modelOverride.trim();
  } else if (profileKey) {
    const effective = await getEffectiveProfiles(resolver, functionId, scopeId);
    const profile = effective.profiles?.[profileKey];
    if (!profile?.model) {
      throw new Error(
        `No profile for "${profileKey}" on function "${functionId}" (scope: ${scopeId}). Run an evaluation and apply a winner.`
      );
    }
    selectedModel = profile.model;
    temperature = profile.temperature;
    maxTokens = profile.maxTokens;
    const applied = await getAppliedProfileSet(resolver, functionId, scopeId);
    appliedProfileSetId = applied?.id;
  }

  return {
    functionId,
    scopeId,
    effectiveDefinition,
    effectiveDefinitionHash: effectiveDefinitionHashValue,
    selectedProfile: profileKey,
    selectedModel,
    temperature,
    maxTokens,
    appliedProfileSetId,
    content: effectiveDefinition,
    effectiveContentFingerprint: effectiveDefinitionHashValue,
  };
}

export type GetEffectiveDefinitionOptions = {
  resolver: ContentResolver;
  contentProvider?: FunctionContentProvider;
};

/**
 * Get effective definition (instructions + rules) and hash for a function.
 * Scope overrides not yet implemented; definition is at function level.
 */
export async function getEffectiveDefinition(
  functionId: string,
  _scopeId: string,
  options: GetEffectiveDefinitionOptions
): Promise<{ instruction: string; rules: Array<{ rule: string; weight: number }>; effectiveDefinitionHash: string }> {
  const { resolver, contentProvider } = options;
  let instruction: string;
  let rules: Array<{ rule: string; weight: number }>;

  if (contentProvider) {
    const content = await contentProvider.getFunctionContent({ functionId });
    instruction =
      content.instructions?.strong ||
      content.instructions?.weak ||
      content.instructions?.ultra ||
      "";
    rules = Array.isArray(content.rules) ? (content.rules as Array<{ rule: string; weight: number }>) : [];
  } else {
    instruction = await resolveSkillInstructions(resolver, functionId, "strong");
    rules = await getSkillRules(resolver, functionId);
    if (rules.length === 0) rules = await resolveSkillRules(resolver, functionId);
  }

  const effectiveDefinitionHashValue = effectiveDefinitionHash(instruction, rules);
  return { instruction, rules, effectiveDefinitionHash: effectiveDefinitionHashValue };
}
