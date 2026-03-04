import { callAI } from "../callAI.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface TranslateParams {
    text: string;
    targetLanguage: string;
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface TranslateResult {
    translatedText: string;
    detectedSourceLanguage?: string;
}

/**
 * Translates text to a target language.
 */
export async function translate(params: TranslateParams): Promise<TranslateResult> {
    const { text, targetLanguage, mode = "normal", client, model } = params;

    const instructions = `
Translate the following text into ${targetLanguage}.
Maintain the original tone and context.
Detect the source language and include it in your response.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".
    `.trim();

    const result = await callAI<TranslateResult>({
        client,
        mode,
        instructions: { weak: instructions, normal: instructions },
        prompt: text,
        model,
    });

    return result.data;
}
