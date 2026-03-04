import {
  ContentResolver,
  normalizeKeySegment,
  type ContentManagerConfig,
} from "nx-content";
import { DEFAULT_SKILLS_BRANCH, DEFAULT_SKILLS_REPO_URL } from "./skillsRepo.js";

const ENV_TOKEN =
  typeof process !== "undefined"
    ? process.env.SKILLS_PUBLISHER_TOKEN || process.env.GITHUB_TOKEN
    : undefined;

export type SkillsResolverOptions = {
  /** Override default Git repo URL. Omit to use DEFAULT_SKILLS_REPO_URL. */
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
      : DEFAULT_SKILLS_REPO_URL;
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
 * Uses DEFAULT_SKILLS_REPO_URL and DEFAULT_SKILLS_BRANCH unless overridden.
 * Token: options.gitToken, or env SKILLS_PUBLISHER_TOKEN, or GITHUB_TOKEN.
 */
export function getSkillsResolver(
  options?: SkillsResolverOptions
): ContentResolver {
  const config = getSkillsContentConfig(options);
  return new ContentResolver(config);
}

/** LlmMode for skill instruction variant (weak / normal / strong). */
export type SkillMode = "weak" | "normal" | "strong";

/**
 * Content key for mode-specific skill instructions.
 * Convention: skills/<skillKey>/<mode> e.g. skills/extractTopics/strong
 */
export function skillInstructionsKeyForMode(
  skillKey: string,
  mode: SkillMode
): string {
  const segment = normalizeKeySegment(skillKey);
  return `skills/${segment}/${mode}`;
}

/**
 * Content key for skill rules (JudgeRule[] or similar).
 * Convention: skills/<skillKey>/rules
 */
export function skillRulesKey(skillKey: string): string {
  const segment = normalizeKeySegment(skillKey);
  return `skills/${segment}/rules`;
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
