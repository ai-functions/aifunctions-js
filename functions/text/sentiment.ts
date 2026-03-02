import { callAI } from "../callAI.js";

export interface SentimentParams {
    text: string;
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
    const { text, model = "gpt-4o-mini" } = params;

    const result = await callAI<SentimentResult>({
        model,
        instructions: { weak: instructions, strong: instructions },
        prompt: text,
    });

    return result.data;
}
