import { callAI } from "../callAI.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface ExtractEntitiesParams {
    text: string;
    entityTypes?: string[];
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface Entity {
    name: string;
    type: string;
    context?: string;
}

export interface ExtractEntitiesResult {
    entities: Entity[];
}

/**
 * Extracts named entities from the text.
 */
export async function extractEntities(params: ExtractEntitiesParams): Promise<ExtractEntitiesResult> {
    const {
        text,
        entityTypes = ["Person", "Organization", "Location", "Date", "Product"],
        mode = "normal",
        client,
        model,
    } = params;

    const strongInstructions = `
Extract named entities from the text. 
Focus on: ${entityTypes.join(", ")}.
For each, provide name, type, and brief context.
Respond in JSON: {"entities": [{"name": "...", "type": "...", "context": "..."}]}
    `.trim();

    const weakInstructions = `
Extract entities: ${entityTypes.join(", ")}.
JSON ONLY: {"entities": [{"name": "...", "type": "..."}]}
No chat.
    `.trim();

    const result = await callAI<ExtractEntitiesResult>({
        client,
        mode,
        instructions: {
            normal: strongInstructions,
            weak: weakInstructions,
        },
        prompt: text,
        model,
    });

    return result.data;
}
