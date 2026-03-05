import { createClient, getSkillsResolver, getSkillNamesFromContent, getProfiles, resolveSkillInstructions, getSkillRules, resolveSkillRules } from "../src/index.js";
import type { Client } from "../src/index.js";
import type { ContentResolver } from "nx-content";
import { executeSkill } from "./core/executor.js";
import { buildRequestPrompt } from "./core/prompt.js";
import { askJson } from "./askJson.js";
import { validateAgainstSchema } from "./validate/validateOutput.js";
import type { ValidateOutputResult } from "./validate/validateOutput.js";
import type { RestrictedJsonSchemaObject } from "../src/index.js";
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
import { validateOutput } from "./validate/validateOutput.js";

/** Options passed to built-in skills when run() has a resolver (e.g. rules from content). */
export type SkillRunOptions = { rules?: Array<{ rule: string; weight: number }> };
export type SkillFn = (params: unknown, opts?: SkillRunOptions) => Promise<unknown>;

const judgeFn: SkillFn = (req: unknown, opts?: SkillRunOptions) => judgeV1(req as Parameters<typeof judgeV1>[0], opts);
const fixInstructionsFn: SkillFn = (req: unknown) => fixInstructionsV1(req as Parameters<typeof fixInstructionsV1>[0]);
const generateRuleFn: SkillFn = (req: unknown) => generateRuleV1(req as Parameters<typeof generateRuleV1>[0]);
const generateJudgeRulesFn: SkillFn = (req: unknown) => generateJudgeRulesV1(req as Parameters<typeof generateJudgeRulesV1>[0]);
const optimizeInstructionsFn: SkillFn = (req: unknown) => optimizeInstructionsV1(req as Parameters<typeof optimizeInstructionsV1>[0]);
const compareFn: SkillFn = (req: unknown) => compareV1(req as Parameters<typeof compareV1>[0]);
const raceModelsFn: SkillFn = (req: unknown) => raceModelsV1(req as Parameters<typeof raceModelsV1>[0]);
const generateInstructionsFn: SkillFn = (req: unknown) => generateInstructionsV1(req as Parameters<typeof generateInstructionsV1>[0]);
const collectionMappingFn: SkillFn = (req: unknown) => collectionMappingV1(req as Parameters<typeof collectionMappingV1>[0]);

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
  judge: judgeFn,
  "ai.judge.v1": judgeFn,
  "ai.normalize-judge-rules.v1": (req: unknown) => Promise.resolve(normalizeJudgeRules(req as Parameters<typeof normalizeJudgeRules>[0])),
  "ai.aggregate-judge-feedback.v1": (req: unknown) => Promise.resolve(aggregateJudgeFeedback(req as Parameters<typeof aggregateJudgeFeedback>[0])),
  fixInstructions: fixInstructionsFn,
  "ai.fix-instructions.v1": fixInstructionsFn,
  generateRule: generateRuleFn,
  "ai.generate-rule.v1": generateRuleFn,
  generateJudgeRules: generateJudgeRulesFn,
  "ai.generate-judge-rules.v1": generateJudgeRulesFn,
  optimizeInstructions: optimizeInstructionsFn,
  "ai.optimize-instructions.v1": optimizeInstructionsFn,
  compare: compareFn,
  "ai.compare.v1": compareFn,
  raceModels: raceModelsFn,
  "ai.race-models.v1": raceModelsFn,
  generateInstructions: generateInstructionsFn,
  "ai.generate-instructions.v1": generateInstructionsFn,
  collectionMapping: collectionMappingFn,
  "recordsMapper.collectionMapping.v1": collectionMappingFn,
} as Record<string, SkillFn>;

/** Canonical skill names returned by getSkillNames() (no V1/dotted aliases). */
const PRIMARY_SKILL_NAMES: string[] = [
  "matchLists",
  "extractTopics",
  "extractEntities",
  "summarize",
  "classify",
  "sentiment",
  "translate",
  "rank",
  "cluster",
  "ai.ask",
  "judge",
  "compare",
  "generateInstructions",
  "optimizeInstructions",
  "fixInstructions",
  "generateRule",
  "generateJudgeRules",
  "raceModels",
  "collectionMapping",
  "ai.normalize-judge-rules.v1",
  "ai.aggregate-judge-feedback.v1",
];

export type RunOptions = {
  /** Content resolver for dynamic skills (from git). When skill is not built-in, run() uses this to run via runWithContent. Default: getSkillsResolver() if skill not in registry. */
  resolver?: ContentResolver;
  /** When true and resolver is set, validate the skill result against the library index io.output schema and return { result, validation }. Never throws on validation failure; validation.valid and validation.errors indicate contract compliance. */
  validateOutput?: boolean;
  /** Optional LLM client (e.g. BYOK). Merged into request for built-in skills; passed to runWithContent for content skills. */
  client?: Client;
};

/** Return type when run() is called with validateOutput: true. Result is always returned; validation indicates whether it passed the contract. */
export type RunResultWithValidation = {
  result: unknown;
  validation: import("./validate/validateOutput.js").ValidateOutputResult;
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
  let result: unknown;
  if (fn) {
    let rules: Array<{ rule: string; weight: number }> = [];
    if (options?.resolver) {
      rules = await getSkillRules(options.resolver, skill);
      if (rules.length === 0) rules = await resolveSkillRules(options.resolver, skill);
    }
    const req = options?.client
      ? { ...(request as object), client: options.client }
      : request;
    result = await fn(req, { rules });
  } else {
    const resolver = options?.resolver ?? getSkillsResolver();
    const fromContent = await getSkillNamesFromContent(resolver);
    if (!fromContent.includes(skill)) {
      const available = [...getSkillNames(), ...fromContent];
      throw new Error(`Unknown skill: ${skill}. Available: ${available.join(", ")}`);
    }
    result = await runWithContent(skill, request, { resolver, client: options?.client });
  }
  if (options?.validateOutput && options?.resolver) {
    const validation = await validateOutput(skill, result, { resolver: options.resolver });
    return { result, validation };
  }
  return result;
}

/** Canonical modes for runSkill (weak | strong | ultra). */
export type RunSkillMode = "weak" | "strong" | "ultra";

export type RunSkillParams = {
  /** Skill name (e.g. "mySkill") or content prefix (e.g. "skills/mySkill"). Instructions loaded from skills/<id>/<mode>. */
  key: string;
  /** weak | strong | ultra. */
  mode: RunSkillMode;
  /** Raw USER prompt (INPUT_MD). */
  inputMd: string;
  /** Content resolver (e.g. getSkillsResolver()). */
  resolver: ContentResolver;
  client?: Client;
  /** If provided, validate parsed output and return { data, validation }. */
  outputSchema?: RestrictedJsonSchemaObject;
};

export type RunSkillResult = { data: unknown; validation: ValidateOutputResult };

/**
 * Run a skill by content key + raw input (advanced). Loads instructions from skills/<key>/<mode>, calls the model with inputMd as user prompt, returns parsed JSON.
 * Use run(skillName, request) for the high-level function API; use runSkill when you have custom keys and raw INPUT_MD.
 */
export async function runSkill(params: RunSkillParams): Promise<RunSkillResult> {
  const { key, mode, inputMd, resolver, client: providedClient, outputSchema } = params;
  const skillName = key.replace(/^skills\//, "").split("/")[0] || key;
  const instruction = await resolveSkillInstructions(resolver, skillName, mode);
  const client = providedClient ?? createClient({ backend: "openrouter" });
  const res = await askJson({
    prompt: inputMd,
    instructions: { weak: instruction, normal: instruction, strong: instruction },
    client,
    mode,
  });
  if (!res.ok) throw new Error(`${res.errorCode}: ${res.message}`);
  const data = res.parsed;
  if (outputSchema) {
    const validation = validateAgainstSchema(data, outputSchema);
    return { data, validation };
  }
  return { data, validation: { valid: true as const } };
}

/**
 * List built-in skill names (sync). Returns clean names (e.g. judge, compare); V1/dotted aliases are not listed.
 * Use getSkillNamesAsync(resolver) to include skills discovered from content.
 */
export function getSkillNames(): string[] {
  return [...PRIMARY_SKILL_NAMES];
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

/** Mode for content-resolved instructions. Profile modes (best/cheapest/fastest/balanced) resolve from race results; weak/normal/strong/ultra use instruction files. */
export type ContentSkillMode = "weak" | "normal" | "strong" | "ultra" | "best" | "cheapest" | "fastest" | "balanced";

export type RunWithContentOptions = {
  /** Content resolver (e.g. from getSkillsResolver()). Required for runWithContent. */
  resolver: ContentResolver;
  /** Client for the LLM call. Default: createClient({ backend: "openrouter" }). */
  client?: Client;
  /** Mode for instruction variant. Default: (request as { mode?: ContentSkillMode }).mode ?? "normal". */
  mode?: ContentSkillMode;
};

const PROFILE_MODES: ContentSkillMode[] = ["best", "cheapest", "fastest", "balanced"];

/**
 * Run a skill by name using instructions (and optionally rules) resolved from content.
 * When mode is best/cheapest/fastest/balanced, resolves model/temperature/maxTokens from stored race profiles; fails with an actionable error if no profile exists.
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

  const instructionMode: "weak" | "normal" | "strong" = PROFILE_MODES.includes(mode) ? "normal" : mode === "weak" ? "weak" : "strong";
  const instruction = await resolveSkillInstructions(resolver, skillName, instructionMode);
  let rules = await getSkillRules(resolver, skillName);
  if (rules.length === 0) rules = await resolveSkillRules(resolver, skillName);

  if (PROFILE_MODES.includes(mode)) {
    const { profiles } = await getProfiles(resolver, skillName);
    const profile = profiles?.[mode as keyof typeof profiles];
    if (!profile?.model) {
      throw new Error(
        `No race profile for mode "${mode}" on function "${skillName}". Run a race first (POST /race/models with functionKey) to set winner profiles.`
      );
    }
    return executeSkill<unknown>({
      request,
      buildPrompt: (r) => `# ${skillName}\n\n` + buildRequestPrompt(r),
      instructions: { weak: instruction, normal: instruction, strong: instruction },
      rules,
      client,
      mode: "normal",
      model: profile.model,
      temperature: profile.temperature,
      maxTokens: profile.maxTokens,
    });
  }

  return executeSkill<unknown>({
    request,
    buildPrompt: (r) => `# ${skillName}\n\n` + buildRequestPrompt(r),
    instructions: { weak: instruction, normal: instruction, strong: instruction },
    rules,
    client,
    mode: mode === "ultra" ? "strong" : (mode as "weak" | "normal" | "strong"),
  });
}
