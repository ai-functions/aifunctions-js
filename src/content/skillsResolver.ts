import {
  ContentResolver,
  normalizeKeySegment,
  type ContentManagerConfig,
} from "nx-content";
import { DEFAULT_SKILLS_BRANCH, getSkillsRepoUrl } from "./skillsRepo.js";

const ENV_TOKEN =
  typeof process !== "undefined"
    ? process.env.SKILLS_PUBLISHER_TOKEN || process.env.GITHUB_TOKEN
    : undefined;

export type SkillsResolverOptions = {
  /** Override default Git repo URL. Omit to use getSkillsRepoUrl() (env GITHUB_REPO_URL or default). */
  gitRepoUrl?: string | null;
  /** Override default branch. */
  gitBranch?: string;
  /** Override token (e.g. for publish). Omit to use SKILLS_PUBLISHER_TOKEN or GITHUB_TOKEN. */
  gitToken?: string;
  /** Local content root (overrides Git when mode is 'dev'). */
  localRoot?: string;
  /** 'dev' = local wins, 'prod' = git wins. Default 'prod' for skills. */
  mode?: "dev" | "prod";
  /** Cache TTL in ms. */
  cacheTtlMs?: number;
};

/**
 * Build nx-content config for the default skills repo with optional overrides.
 * Token comes from options.gitToken or env (SKILLS_PUBLISHER_TOKEN, then GITHUB_TOKEN).
 */
function getSkillsContentConfig(
  options?: SkillsResolverOptions
): ContentManagerConfig {
  const gitRepoUrl =
    options?.gitRepoUrl !== undefined
      ? options.gitRepoUrl
      : getSkillsRepoUrl();
  const gitBranch = options?.gitBranch ?? DEFAULT_SKILLS_BRANCH;
  const gitToken = options?.gitToken ?? ENV_TOKEN;

  return {
    localRoot: options?.localRoot,
    gitRepoUrl: gitRepoUrl ?? undefined,
    gitBranch,
    gitToken,
    mode: options?.mode ?? "prod",
    cacheTtlMs: options?.cacheTtlMs,
  };
}

/**
 * Create a ContentResolver for skills content.
 * Uses getSkillsRepoUrl() (env GITHUB_REPO_URL or default) and DEFAULT_SKILLS_BRANCH unless overridden.
 * Token: options.gitToken, or env SKILLS_PUBLISHER_TOKEN, or GITHUB_TOKEN.
 */
export function getSkillsResolver(
  options?: SkillsResolverOptions
): ContentResolver {
  const config = getSkillsContentConfig(options);
  return new ContentResolver(config);
}

/** LlmMode for skill instruction variant. Canonical files: weak, strong, ultra. API "normal" maps to strong. */
export type SkillMode = "weak" | "normal" | "strong" | "ultra";

/** Canonical instruction file names under skills/<id>/ (no "normal" file; normal → strong). */
const MODE_TO_FILE: Record<SkillMode, string> = {
  weak: "weak",
  normal: "strong",
  strong: "strong",
  ultra: "ultra",
};

/**
 * Content key for mode-specific skill instructions.
 * Canonical: skills/<skillId>/weak, strong, ultra. API mode "normal" reads/writes strong.
 */
export function skillInstructionsKeyForMode(
  skillKey: string,
  mode: SkillMode
): string {
  const segment = normalizeKeySegment(skillKey);
  return `skills/${segment}/${MODE_TO_FILE[mode]}`;
}

/**
 * Content key for skill rules. Convention: skills/<skillId>/rules (inside skill folder).
 */
export function skillRulesKey(skillKey: string): string {
  const segment = normalizeKeySegment(skillKey);
  return `skills/${segment}/rules`;
}

/**
 * @deprecated Use folder-based keys only: skills/<skillId>/weak, strong, ultra. Prefer getSkillInstructions(resolver, name) which reads from strong.
 */
export function skillInstructionsFileKey(skillName: string): string {
  const segment = normalizeKeySegment(skillName);
  return `skills/${segment}-instructions.md`;
}

/**
 * @deprecated Use folder-based key only: skills/<skillId>/rules. Prefer getSkillRules(resolver, name).
 */
export function skillRulesFileKey(skillName: string): string {
  const segment = normalizeKeySegment(skillName);
  return `skills/${segment}-rules.json`;
}

/**
 * Resolve skill instructions for the given skill key and mode from the content resolver.
 * Uses key skills/<skillKey>/<mode>. Returns the raw instruction text (SYSTEM).
 */
export async function resolveSkillInstructions(
  resolver: ContentResolver,
  skillKey: string,
  mode: SkillMode
): Promise<string> {
  const key = skillInstructionsKeyForMode(skillKey, mode);
  const { text } = await resolver.resolveInstructions(key);
  return text;
}

/** Rule shape for skill rules (judge rules etc.). */
export type SkillRule = { rule: string; weight: number };

function parseRulesRaw(raw: string): SkillRule[] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (x): x is SkillRule =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as { rule?: unknown }).rule === "string" &&
      typeof (x as { weight?: unknown }).weight === "number"
  );
}

/**
 * Get skill instructions from the canonical folder key (skills/<id>/strong).
 * Returns empty string if key not found.
 */
export async function getSkillInstructions(
  resolver: ContentResolver,
  skillName: string
): Promise<string> {
  const key = skillInstructionsKeyForMode(skillName, "strong");
  try {
    const raw = await resolver.get(key);
    return typeof raw === "string" ? raw : "";
  } catch {
    return "";
  }
}

/**
 * Update skill instructions at the canonical folder key (skills/<id>/strong).
 * Use resolver.pushToRemote() after to persist to git.
 */
export async function setSkillInstructions(
  resolver: ContentResolver,
  skillName: string,
  content: string
): Promise<void> {
  const key = skillInstructionsKeyForMode(skillName, "strong");
  await resolver.set(key, content);
}

/**
 * Get skill rules from the canonical folder key (skills/<id>/rules).
 * Returns empty array if not found or parse fails.
 */
export async function getSkillRules(
  resolver: ContentResolver,
  skillName: string
): Promise<SkillRule[]> {
  const key = skillRulesKey(skillName);
  try {
    const raw = await resolver.get(key);
    return parseRulesRaw(typeof raw === "string" ? raw : "[]");
  } catch {
    return [];
  }
}

/**
 * Update skill rules at the canonical folder key (skills/<id>/rules).
 * Use resolver.pushToRemote() after to persist to git.
 */
export async function setSkillRules(
  resolver: ContentResolver,
  skillName: string,
  rules: SkillRule[]
): Promise<void> {
  const key = skillRulesKey(skillName);
  await resolver.set(key, JSON.stringify(rules, null, 2));
}

/**
 * Derive skill name from a key under "skills/".
 * Canonical: only folder-based keys skills/<skillId>/<file> (e.g. skills/classify/weak, skills/classify/rules).
 */
function skillNameFromKey(key: string): string | null {
  const normalized = key.replace(/\\/g, "/").trim();
  if (!normalized.startsWith("skills/")) return null;
  const parts = normalized.slice("skills/".length).split("/").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[0] || null;
}

/**
 * Discover skill names from the content resolver by listing keys under "skills/".
 * Only folder-based keys (skills/<skillId>/...) are considered; root-level *-instructions.md / *-rules.json are not allowed.
 */
export async function getSkillNamesFromContent(
  resolver: ContentResolver
): Promise<string[]> {
  const keys = await resolver.listKeys("skills/");
  const names = new Set<string>();
  for (const key of keys) {
    const name = skillNameFromKey(key);
    if (name) names.add(name);
  }
  return [...names];
}

/**
 * Resolve skill rules for the given skill key from the content resolver.
 * Uses key skills/<skillKey>/rules. Expects JSON array of { rule: string; weight: number }.
 * Returns parsed rules or empty array if key not found or parse fails.
 */
export async function resolveSkillRules(
  resolver: ContentResolver,
  skillKey: string
): Promise<Array<{ rule: string; weight: number }>> {
  const key = skillRulesKey(skillKey);
  try {
    const raw = await resolver.get(key);
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (x): x is { rule: string; weight: number } =>
          typeof x === "object" &&
          x !== null &&
          typeof (x as { rule?: unknown }).rule === "string" &&
          typeof (x as { weight?: unknown }).weight === "number"
      );
    }
    return [];
  } catch {
    return [];
  }
}

/** Version entry from nx-content getVersions (git log). */
export type SkillVersionEntry = {
  sha: string;
  message: string;
  date: string;
  author?: string;
};

/** Resolver with optional version APIs (nx-content when gaps are closed). */
type ResolverWithVersions = ContentResolver & {
  getVersions?(key: string): Promise<SkillVersionEntry[]>;
  getAtRef?(key: string, ref: string): Promise<string>;
  setActiveVersion?(
    key: string,
    ref: string,
    options?: { commit?: boolean; message?: string }
  ): Promise<{ updated: boolean }>;
};

function requireVersions(resolver: ContentResolver): asserts resolver is ResolverWithVersions {
  const r = resolver as ResolverWithVersions;
  if (typeof r.getVersions !== "function" || typeof r.getAtRef !== "function" || typeof r.setActiveVersion !== "function") {
    throw new Error("ContentResolver does not support version APIs (getVersions, getAtRef, setActiveVersion). Ensure nx-content is up to date.");
  }
}

/**
 * List version history for the skill's instructions (skills/<id>/strong).
 * Requires nx-content resolver with getVersions(key).
 */
export async function getSkillInstructionVersions(
  resolver: ContentResolver,
  skillName: string
): Promise<SkillVersionEntry[]> {
  requireVersions(resolver);
  const key = skillInstructionsKeyForMode(skillName, "strong");
  return (resolver as ResolverWithVersions).getVersions!(key);
}

/**
 * List version history for the skill's rules (skills/<id>/rules).
 */
export async function getSkillRulesVersions(
  resolver: ContentResolver,
  skillName: string
): Promise<SkillVersionEntry[]> {
  requireVersions(resolver);
  const key = skillRulesKey(skillName);
  return (resolver as ResolverWithVersions).getVersions!(key);
}

/**
 * Get skill instructions content at a git ref (skills/<id>/strong).
 * Requires nx-content getAtRef(key, ref).
 */
export async function getSkillInstructionsAtRef(
  resolver: ContentResolver,
  skillName: string,
  ref: string
): Promise<string> {
  requireVersions(resolver);
  const key = skillInstructionsKeyForMode(skillName, "strong");
  return (resolver as ResolverWithVersions).getAtRef!(key, ref);
}

/**
 * Get skill rules at a git ref (skills/<id>/rules). Returns parsed rules or empty array if not found/invalid.
 */
export async function getSkillRulesAtRef(
  resolver: ContentResolver,
  skillName: string,
  ref: string
): Promise<SkillRule[]> {
  requireVersions(resolver);
  const key = skillRulesKey(skillName);
  const raw = await (resolver as ResolverWithVersions).getAtRef!(key, ref);
  try {
    return parseRulesRaw(raw);
  } catch {
    return [];
  }
}

export type SetActiveVersionOptions = {
  commit?: boolean;
  message?: string;
};

/**
 * Set the active (current) instructions (skills/<id>/strong) to the content at the given ref.
 * Uses nx-content setActiveVersion(key, ref, options). Call pushToRemote() after to publish.
 */
export async function setSkillInstructionsActiveVersion(
  resolver: ContentResolver,
  skillName: string,
  ref: string,
  options?: SetActiveVersionOptions
): Promise<{ updated: boolean }> {
  requireVersions(resolver);
  const key = skillInstructionsKeyForMode(skillName, "strong");
  return (resolver as ResolverWithVersions).setActiveVersion!(key, ref, options);
}

/**
 * Set the active (current) rules (skills/<id>/rules) to the content at the given ref.
 */
export async function setSkillRulesActiveVersion(
  resolver: ContentResolver,
  skillName: string,
  ref: string,
  options?: SetActiveVersionOptions
): Promise<{ updated: boolean }> {
  requireVersions(resolver);
  const key = skillRulesKey(skillName);
  return (resolver as ResolverWithVersions).setActiveVersion!(key, ref, options);
}
