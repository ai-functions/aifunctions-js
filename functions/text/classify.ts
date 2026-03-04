import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface ClassifyParams {
    text: string;
    categories: string[];
    allowMultiple?: boolean;
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface ClassifyResult {
    categories: string[];
    confidence?: number;
}

function instructions(categories: string[], allowMultiple: boolean): SkillInstructions {
    return {
        weak: `Classify into: ${categories.join(", ")}.
JSON ONLY: {"categories": ["..."]}`.trim(),
        normal: `Classify text into categories: ${categories.join(", ")}.
${allowMultiple ? "Select multiple if needed." : "Select exactly one."}
JSON: {"categories": ["..."], "confidence": 0-1}`.trim(),
    };
}

/**
 * Classifies text into one or more provided categories.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function classify(params: ClassifyParams, opts?: SkillRunOptions): Promise<ClassifyResult> {
    const { text, categories, allowMultiple = false, mode = "normal", client, model } = params;
    return executeSkill<ClassifyResult>({
        request: params,
        buildPrompt: (req) => (req as ClassifyParams).text,
        instructions: instructions(categories, allowMultiple),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
