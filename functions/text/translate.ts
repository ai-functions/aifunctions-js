import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
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

function instructions(targetLanguage: string): SkillInstructions {
    const base = `Translate the following text into ${targetLanguage}.
Maintain the original tone and context.
Detect the source language and include it in your response.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".`;
    return { weak: base.trim(), normal: base.trim() };
}

/**
 * Translates text to a target language.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function translate(params: TranslateParams, opts?: SkillRunOptions): Promise<TranslateResult> {
    const { text, targetLanguage, mode = "normal", client, model } = params;
    return executeSkill<TranslateResult>({
        request: params,
        buildPrompt: (req) => (req as TranslateParams).text,
        instructions: instructions(targetLanguage),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
