import { callAI } from "../callAI.js";
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

/**
 * Extracts key topics from the provided text.
 */
export async function extractTopics(params: ExtractTopicsParams): Promise<ExtractTopicsResult> {
    const { text, maxTopics = 5, mode = "normal", client, model } = params;

    const strongInstructions = `
Extract the most important topics from the provided text.
Return a maximum of ${maxTopics} topics.
Respond in JSON format with a "topics" array of strings.
    `.trim();

    const weakInstructions = `
Extract up to ${maxTopics} topics from the text.
JSON ONLY: {"topics": ["Topic 1", "Topic 2", ...]}
No explanation.
    `.trim();

    const result = await callAI<ExtractTopicsResult>({
        client,
        mode,
        instructions: {
            weak: weakInstructions,
            normal: strongInstructions,
        },
        prompt: text,
        model,
    });

    return result.data;
}
