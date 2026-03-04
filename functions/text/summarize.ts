import { callAI, callAIStream } from "../callAI.js";
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

/**
 * Generates a concise summary and key points from the input text.
 */
export async function summarize(params: SummarizeParams): Promise<SummarizeResult> {
    const { text, length = "medium", mode = "normal", client, model } = params;

    const lengthMap = {
        brief: "1-2 sentences",
        medium: "a concise paragraph",
        detailed: "3-5 paragraphs"
    };

    const strongInstructions = `
Summarize the following text. 
Length: ${lengthMap[length]}.
Extract key points.
JSON: {"summary": "...", "keyPoints": ["...", "..."]}
    `.trim();

    const weakInstructions = `
Summarize text (${lengthMap[length]}).
JSON ONLY: {"summary": "...", "keyPoints": []}
    `.trim();

    const result = await callAI<SummarizeResult>({
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

/**
 * Streaming variant: yields text chunks (and usage/done). Accumulate the text and parse
 * as JSON when you receive type "done" to get SummarizeResult.
 */
export async function* summarizeStream(
    params: SummarizeParams
): AsyncGenerator<StreamChunk> {
    const { text, length = "medium", mode = "normal", client, model } = params;
    const lengthMap = {
        brief: "1-2 sentences",
        medium: "a concise paragraph",
        detailed: "3-5 paragraphs",
    };
    const strongInstructions = `
Summarize the following text. 
Length: ${lengthMap[length]}.
Extract key points.
JSON: {"summary": "...", "keyPoints": ["...", "..."]}
    `.trim();
    const weakInstructions = `
Summarize text (${lengthMap[length]}).
JSON ONLY: {"summary": "...", "keyPoints": []}
    `.trim();
    yield* callAIStream({
        client,
        mode,
        instructions: { weak: weakInstructions, normal: strongInstructions },
        prompt: text,
        model,
    });
}
