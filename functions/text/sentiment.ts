import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface SentimentParams {
    text: string;
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface SentimentResult {
    sentiment: "positive" | "negative" | "neutral";
    score: number;
}

const INSTRUCTIONS: SkillInstructions = {
    weak: `Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".`.trim(),
    normal: `Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".`.trim(),
};

/**
 * Analyzes the sentiment of the provided text.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function sentiment(params: SentimentParams, opts?: SkillRunOptions): Promise<SentimentResult> {
    const { text, mode = "normal", client, model } = params;
    return executeSkill<SentimentResult>({
        request: params,
        buildPrompt: (req) => (req as SentimentParams).text,
        instructions: INSTRUCTIONS,
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
