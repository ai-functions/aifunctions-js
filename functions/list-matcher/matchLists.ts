import { callAI } from "../callAI.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface MatchListsParams {
    list1: any[];
    list2: any[];
    guidance: string;
    /**
     * Optional: matches from a previous run. List1 items that are already in
     * existingMatches (by JSON equality of source) are skipped; only the rest
     * are sent to the model. Results are merged so you get no doubles and no
     * crash — safe to call repeatedly as new records arrive.
     */
    existingMatches?: MatchResult[];
    mode?: LlmMode;
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
function sourceKey(obj: unknown): string {
    return JSON.stringify(obj);
}

export async function matchLists(params: MatchListsParams): Promise<MatchListsResult> {
    const {
        list1,
        list2,
        guidance,
        existingMatches = [],
        mode = "normal",
        client,
        model,
        additionalInstructions,
    } = params;

    const alreadyMatchedKeys = new Set(existingMatches.map((m) => sourceKey(m.source)));
    const list1ToMatch = list1.filter((item) => !alreadyMatchedKeys.has(sourceKey(item)));

    if (list1ToMatch.length === 0) {
        return { matches: [...existingMatches], unmatched: [] };
    }

    const strongInstructions = `
You are an AI assistant specialized in matching items from two lists based on naming and semantic similarity.
Your goal is to find the best match for each item in the first list from the second list.
Strictly follow the user's guidance for matching criteria.
Ignore arbitrary IDs (like UUIDs) unless clearly shared.
Do not match the same List 2 item to more than one List 1 item.
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
No explanation outside JSON. Use exact objects for source/target. Each List 2 item at most once.
    `.trim();

    const userPrompt = `
List 1: ${JSON.stringify(list1ToMatch)}
List 2: ${JSON.stringify(list2)}
Guidance: ${guidance}
    `.trim();

    const result = await callAI<MatchListsResult>({
        client,
        mode,
        instructions: {
            weak: weakInstructions,
            normal: strongInstructions,
        },
        prompt: userPrompt,
        model,
    });

    return {
        matches: [...existingMatches, ...result.data.matches],
        unmatched: result.data.unmatched,
    };
}
