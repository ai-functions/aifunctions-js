import { callAI } from "../callAI.js";
import type { Client } from "../../src/index.js";

export interface MatchListsParams {
    list1: any[];
    list2: any[];
    guidance: string;
    mode?: "weak" | "strong";
    client?: Client;
    model?: string;
    additionalInstructions?: string;
}

export interface MatchResult {
    source: any;
    target: any;
    reason?: string;
}

export interface MatchListsResult {
    matches: MatchResult[];
    unmatched: any[];
}

/**
 * Intelligently matches items from two lists based on naming and context.
 */
export async function matchLists(params: MatchListsParams): Promise<MatchListsResult> {
    const {
        list1,
        list2,
        guidance,
        mode = "strong",
        client,
        model = "gpt-4o-mini",
        additionalInstructions
    } = params;

    const strongInstructions = `
You are an AI assistant specialized in matching items from two lists based on naming and semantic similarity.
Your goal is to find the best match for each item in the first list from the second list.
Strictly follow the user's guidance for matching criteria.
Ignore arbitrary IDs (like UUIDs) unless clearly shared.
Output your response in valid JSON:
{
    "matches": [{"source": <full object from list1>, "target": <full object from list2>, "reason": "..."}],
    "unmatched": [<full objects from list1 with no match>]
}
${additionalInstructions ? `Additional Instructions: ${additionalInstructions}` : ""}
    `.trim();

    const weakInstructions = `
Match List 1 to List 2. 
Guidance: ${guidance}
Output JSON ONLY:
{"matches": [{"source": object, "target": object, "reason": "string"}], "unmatched": []}
No explanation outside JSON. Use exact objects for source/target.
    `.trim();

    const userPrompt = `
List 1: ${JSON.stringify(list1)}
List 2: ${JSON.stringify(list2)}
Guidance: ${guidance}
    `.trim();

    const result = await callAI<MatchListsResult>({
        client,
        mode,
        instructions: {
            strong: strongInstructions,
            weak: weakInstructions,
        },
        prompt: userPrompt,
        model,
    });

    return result.data;
}
