import { type SkillRunOptions } from "../callAI.js";
import { executeSkill, executeSkillStream } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { Client, LlmMode } from "../../src/index.js";
import type { StreamChunk } from "../../src/index.js";

export interface SummarizeParams {
    text: string;
    length?: "brief" | "medium" | "detailed";
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface SummarizeResult {
    summary: string;
    keyPoints: string[];
}

const LENGTH_MAP = {
    brief: "1-2 sentences",
    medium: "a concise paragraph",
    detailed: "3-5 paragraphs",
} as const;

function instructions(length: keyof typeof LENGTH_MAP): SkillInstructions {
    return {
        weak: `Summarize text (${LENGTH_MAP[length]}).
JSON ONLY: {"summary": "...", "keyPoints": []}`.trim(),
        normal: `Summarize the following text.
Length: ${LENGTH_MAP[length]}.
Extract key points.
JSON: {"summary": "...", "keyPoints": ["...", "..."]}`.trim(),
    };
}

/**
 * Generates a concise summary and key points from the input text.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function summarize(params: SummarizeParams, opts?: SkillRunOptions): Promise<SummarizeResult> {
    const { text, length = "medium", mode = "normal", client, model } = params;
    return executeSkill<SummarizeResult>({
        request: params,
        buildPrompt: (req) => (req as SummarizeParams).text,
        instructions: instructions(length),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}

/**
 * Streaming variant: yields text chunks (and usage/done). Accumulate the text and parse
 * as JSON when you receive type "done" to get SummarizeResult.
 */
export async function* summarizeStream(
    params: SummarizeParams,
    opts?: SkillRunOptions
): AsyncGenerator<StreamChunk> {
    const { length = "medium", mode = "normal", client, model } = params;
    yield* executeSkillStream({
        request: params,
        buildPrompt: (req) => (req as SummarizeParams).text,
        instructions: instructions(length),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
