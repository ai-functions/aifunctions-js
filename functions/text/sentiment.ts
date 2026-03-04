import { callAI } from "../callAI.js";
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

const instructions = `
Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".
`.trim();

/**
 * Analyzes the sentiment of the provided text.
 */
export async function sentiment(params: SentimentParams): Promise<SentimentResult> {
    const { text, mode = "normal", client, model } = params;

    const result = await callAI<SentimentResult>({
        client,
        mode,
        instructions: { weak: instructions, normal: instructions },
        prompt: text,
        model,
    });

    return result.data;
}
