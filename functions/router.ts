import { createClient, getSkillsResolver, getSkillNamesFromContent, resolveSkillInstructions, getSkillRules, resolveSkillRules } from "../src/index.js";
import { executeSkill } from "./core/executor.js";
import { buildRequestPrompt } from "./core/prompt.js";
import type { Client } from "../src/index.js";
import type { ContentResolver } from "nx-content";
import { matchLists } from "./list-matcher/matchLists.js";
import { extractTopics } from "./extraction/extractTopics.js";
import { extractEntities } from "./extraction/extractEntities.js";
import { summarize } from "./text/summarize.js";
import { classify } from "./text/classify.js";
import { sentiment } from "./text/sentiment.js";
import { translate } from "./text/translate.js";
import { rank } from "./list-operations/rank.js";
import { cluster } from "./list-operations/cluster.js";
import { ask } from "./ai/ask.js";

/** Options passed to built-in skills when run() has a resolver (e.g. rules from content). */
export type SkillRunOptions = { rules?: Array<{ rule: string; weight: number }> };
export type SkillFn = (params: unknown, opts?: SkillRunOptions) => Promise<unknown>;

const SKILLS = {
  matchLists,
  extractTopics,
  extractEntities,
  summarize,
  classify,
  sentiment,
  translate,
  rank,
  cluster,
  "ai.ask": ask,
} as Record<string, SkillFn>;

export type RunOptions = {
  /** Content resolver for dynamic skills (from git). When skill is not built-in, run() uses this to run via runWithContent. Default: getSkillsResolver() if skill not in registry. */
  resolver?: ContentResolver;
};

/**
 * Run a skill by name with the given request (full params for that skill).
 * If the skill is built-in (matchLists, extractTopics, etc.), runs the implementation.
 * Otherwise uses the content resolver to run the skill from the repo (runWithContent).
 * Pass options.resolver to use a custom content source; omit to use default getSkillsResolver() for dynamic skills.
 */
export async function run(
  skill: string,
  request: unknown,
  options?: RunOptions
): Promise<unknown> {
  const fn = SKILLS[skill];
  if (fn) {
    let rules: Array<{ rule: string; weight: number }> = [];
    if (options?.resolver) {
      rules = await getSkillRules(options.resolver, skill);
      if (rules.length === 0) rules = await resolveSkillRules(options.resolver, skill);
    }
    return fn(request, { rules });
  }
  const resolver = options?.resolver ?? getSkillsResolver();
  const fromContent = await getSkillNamesFromContent(resolver);
  if (!fromContent.includes(skill)) {
    const available = [...getSkillNames(), ...fromContent];
    throw new Error(`Unknown skill: ${skill}. Available: ${available.join(", ")}`);
  }
  return runWithContent(skill, request, { resolver });
}

/**
 * List built-in skill names (sync). Use getSkillNamesAsync(resolver) to include skills discovered from content.
 */
export function getSkillNames(): string[] {
  return Object.keys(SKILLS);
}

/**
 * List all skill names: built-in plus those discovered from the content resolver.
 * Use this when you want to run or optimize whatever is in the git repo.
 */
export async function getSkillNamesAsync(
  resolver?: ContentResolver
): Promise<string[]> {
  const builtIn = getSkillNames();
  if (!resolver) return builtIn;
  const fromContent = await getSkillNamesFromContent(resolver);
  return [...new Set([...builtIn, ...fromContent])];
}

/** Mode for content-resolved instructions (weak / normal / strong). */
export type ContentSkillMode = "weak" | "normal" | "strong";

export type RunWithContentOptions = {
  /** Content resolver (e.g. from getSkillsResolver()). Required for runWithContent. */
  resolver: ContentResolver;
  /** Client for the LLM call. Default: createClient({ backend: "openrouter" }). */
  client?: Client;
  /** Mode for instruction variant. Default: (request as { mode?: ContentSkillMode }).mode ?? "normal". */
  mode?: ContentSkillMode;
};

/**
 * Run a skill by name using instructions (and optionally rules) resolved from content.
 * Uses the same executor as built-in skills for a single execution path.
 */
export async function runWithContent(
  skillName: string,
  request: unknown,
  options: RunWithContentOptions
): Promise<unknown> {
  const { resolver, client: providedClient } = options;
  const req = request as { mode?: ContentSkillMode };
  const mode: ContentSkillMode = options.mode ?? req.mode ?? "normal";
  const client = providedClient ?? createClient({ backend: "openrouter" });

  const instruction = await resolveSkillInstructions(resolver, skillName, mode);
  let rules = await getSkillRules(resolver, skillName);
  if (rules.length === 0) rules = await resolveSkillRules(resolver, skillName);

  return executeSkill<unknown>({
    request,
    buildPrompt: (r) => `# ${skillName}\n\n` + buildRequestPrompt(r),
    instructions: { weak: instruction, normal: instruction, strong: instruction },
    rules,
    client,
    mode,
  });
}
