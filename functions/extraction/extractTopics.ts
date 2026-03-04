import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface ExtractTopicsParams {
    text: string;
    maxTopics?: number;
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface ExtractTopicsResult {
    topics: string[];
}

function instructions(maxTopics: number): SkillInstructions {
    return {
        weak: `Extract up to ${maxTopics} topics from the text.
JSON ONLY: {"topics": ["Topic 1", "Topic 2", ...]}
No explanation.`.trim(),
        normal: `Extract the most important topics from the provided text.
Return a maximum of ${maxTopics} topics.
Respond in JSON format with a "topics" array of strings.`.trim(),
    };
}

/**
 * Extracts key topics from the provided text.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function extractTopics(params: ExtractTopicsParams, opts?: SkillRunOptions): Promise<ExtractTopicsResult> {
    const { text, maxTopics = 5, mode = "normal", client, model } = params;
    return executeSkill<ExtractTopicsResult>({
        request: params,
        buildPrompt: (req) => (req as ExtractTopicsParams).text,
        instructions: instructions(maxTopics),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
