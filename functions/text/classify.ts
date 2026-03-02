import { callAI } from "../callAI.js";
import type { Client } from "../../src/index.js";

export interface ClassifyParams {
    text: string;
    categories: string[];
    allowMultiple?: boolean;
    mode?: "weak" | "strong";
    client?: Client;
    model?: string;
}

export interface ClassifyResult {
    categories: string[];
    confidence?: number;
}

/**
 * Classifies text into one or more provided categories.
 */
export async function classify(params: ClassifyParams): Promise<ClassifyResult> {
    const { text, categories, allowMultiple = false, mode = "strong", client, model = "gpt-4o-mini" } = params;

    const strongInstructions = `
Classify text into categories: ${categories.join(", ")}.
${allowMultiple ? "Select multiple if needed." : "Select exactly one."}
JSON: {"categories": ["..."], "confidence": 0-1}
    `.trim();

    const weakInstructions = `
Classify into: ${categories.join(", ")}.
JSON ONLY: {"categories": ["..."]}
    `.trim();

    const result = await callAI<ClassifyResult>({
        client,
        mode,
        instructions: {
            strong: strongInstructions,
            weak: weakInstructions,
        },
        prompt: text,
        model,
    });

    return result.data;
}
