import { createClient, resolveSkillInstructions } from "../src/index.js";
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

export type SkillFn = (params: unknown) => Promise<unknown>;

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

/**
 * Run a skill by name with the given request (full params for that skill).
 * Request is passed through unchanged; must include mode, client, model, etc. as needed.
 * @throws if skill name is unknown
 */
export async function run(skill: string, request: unknown): Promise<unknown> {
  const fn = SKILLS[skill];
  if (!fn) {
    throw new Error(`Unknown skill: ${skill}. Available: ${getSkillNames().join(", ")}`);
  }
  return fn(request);
}

/**
 * List registered skill names that can be passed to run().
 */
export function getSkillNames(): string[] {
  return Object.keys(SKILLS);
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
 * Builds INPUT_MD from request (Markdown), uses SYSTEM = resolved instructions, calls client.ask, parses JSON.
 * Use when skill instructions live in the content repo (nx-content).
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

  const inputMd = [
    `# ${skillName}`,
    "",
    "## Request",
    "",
    "```json",
    JSON.stringify(request, null, 2),
    "```",
  ].join("\n");

  const res = await client.ask(inputMd, {
    system: instruction,
    maxTokens: 4096,
    temperature: mode === "weak" ? 0.1 : 0.7,
  });

  let text = res.text.trim();
  if (text.startsWith("```")) {
    text = text.replace(/^```[a-z]*\n/i, "").replace(/\n```$/g, "").trim();
  }

  try {
    return JSON.parse(text) as unknown;
  } catch (e) {
    throw new Error(
      `Failed to parse response as JSON: ${text.substring(0, 500)}... Error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}
