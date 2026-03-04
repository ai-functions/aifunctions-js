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
import { judgeV1 } from "./judge/judgeV1.js";
import { normalizeJudgeRules } from "./judge/normalizeJudgeRules.js";
import { aggregateJudgeFeedback } from "./judge/aggregateJudgeFeedback.js";
import { fixInstructionsV1 } from "./judge/fixInstructionsV1.js";
import { generateRuleV1 } from "./judge/generateRuleV1.js";
import { generateJudgeRulesV1 } from "./judge/generateJudgeRulesV1.js";
import { optimizeInstructionsV1 } from "./judge/optimizeInstructionsV1.js";
import { compareV1 } from "./orchestration/compareV1.js";
import { raceModelsV1 } from "./orchestration/raceModelsV1.js";
import { generateInstructionsV1 } from "./orchestration/generateInstructionsV1.js";
import { collectionMappingV1 } from "./recordsMapper/collectionMappingV1.js";

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
  "ai.judge.v1": (req: unknown, opts?: SkillRunOptions) => judgeV1(req as Parameters<typeof judgeV1>[0], opts),
  "ai.normalize-judge-rules.v1": (req: unknown) => Promise.resolve(normalizeJudgeRules(req as Parameters<typeof normalizeJudgeRules>[0])),
  "ai.aggregate-judge-feedback.v1": (req: unknown) => Promise.resolve(aggregateJudgeFeedback(req as Parameters<typeof aggregateJudgeFeedback>[0])),
  "ai.fix-instructions.v1": (req: unknown) => fixInstructionsV1(req as Parameters<typeof fixInstructionsV1>[0]),
  "ai.generate-rule.v1": (req: unknown) => generateRuleV1(req as Parameters<typeof generateRuleV1>[0]),
  "ai.generate-judge-rules.v1": (req: unknown) => generateJudgeRulesV1(req as Parameters<typeof generateJudgeRulesV1>[0]),
  "ai.optimize-instructions.v1": (req: unknown) => optimizeInstructionsV1(req as Parameters<typeof optimizeInstructionsV1>[0]),
  "ai.compare.v1": (req: unknown) => compareV1(req as Parameters<typeof compareV1>[0]),
  "ai.race-models.v1": (req: unknown) => raceModelsV1(req as Parameters<typeof raceModelsV1>[0]),
  "ai.generate-instructions.v1": (req: unknown) => generateInstructionsV1(req as Parameters<typeof generateInstructionsV1>[0]),
  "recordsMapper.collectionMapping.v1": (req: unknown) => collectionMappingV1(req as Parameters<typeof collectionMappingV1>[0]),
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
