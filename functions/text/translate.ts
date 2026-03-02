import { callAI } from "../callAI.js";

export interface TranslateParams {
    text: string;
    targetLanguage: string;
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
    const { text, targetLanguage, model = "gpt-4o-mini" } = params;

    const instructions = `
Translate the following text into ${targetLanguage}.
Maintain the original tone and context.
Detect the source language and include it in your response.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".
    `.trim();

    const result = await callAI<TranslateResult>({
        model,
        instructions: { weak: instructions, strong: instructions },
        prompt: text,
    });

    return result.data;
}
