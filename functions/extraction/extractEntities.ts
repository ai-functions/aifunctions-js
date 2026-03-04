import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
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

function instructions(entityTypes: string[]): SkillInstructions {
    return {
        weak: `Extract entities: ${entityTypes.join(", ")}.
JSON ONLY: {"entities": [{"name": "...", "type": "..."}]}
No chat.`.trim(),
        normal: `Extract named entities from the text.
Focus on: ${entityTypes.join(", ")}.
For each, provide name, type, and brief context.
Respond in JSON: {"entities": [{"name": "...", "type": "...", "context": "..."}]}`.trim(),
    };
}

/**
 * Extracts named entities from the text.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function extractEntities(params: ExtractEntitiesParams, opts?: SkillRunOptions): Promise<ExtractEntitiesResult> {
    const {
        text,
        entityTypes = ["Person", "Organization", "Location", "Date", "Product"],
        mode = "normal",
        client,
        model,
    } = params;
    return executeSkill<ExtractEntitiesResult>({
        request: params,
        buildPrompt: (req) => (req as ExtractEntitiesParams).text,
        instructions: instructions(entityTypes),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
