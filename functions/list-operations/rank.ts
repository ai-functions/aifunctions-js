import { callAI } from "../callAI.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface RankParams {
    items: any[];
    query: string;
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface RankedItem {
    item: any;
    score: number;
    reason?: string;
}

export interface RankResult {
    rankedItems: RankedItem[];
}

/**
 * Ranks a list of items based on a query or specific criteria.
 */
export async function rank(params: RankParams): Promise<RankResult> {
    const { items, query, mode = "normal", client, model } = params;

    const instructions = `
Rank the following items based on their relevance to this query: "${query}".
For each item, provide a relevance score between 0 and 1 and a brief reason.
Respond in JSON format with a "rankedItems" array.
Maintain the full original objects in the "item" field.
    `.trim();

    const userPrompt = `
Items to rank:
${JSON.stringify(items, null, 2)}
    `.trim();

    const result = await callAI<RankResult>({
        client,
        mode,
        instructions: { weak: instructions, normal: instructions },
        prompt: userPrompt,
        model,
    });

    return result.data;
}
