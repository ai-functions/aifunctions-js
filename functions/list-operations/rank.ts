import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
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

function instructions(query: string): SkillInstructions {
    const base = `Rank the following items based on their relevance to this query: "${query}".
For each item, provide a relevance score between 0 and 1 and a brief reason.
Respond in JSON format with a "rankedItems" array.
Maintain the full original objects in the "item" field.`;
    return { weak: base.trim(), normal: base.trim() };
}

/**
 * Ranks a list of items based on a query or specific criteria.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function rank(params: RankParams, opts?: SkillRunOptions): Promise<RankResult> {
    const { items, query, mode = "normal", client, model } = params;
    return executeSkill<RankResult>({
        request: params,
        buildPrompt: (req) => `Items to rank:\n${JSON.stringify((req as RankParams).items, null, 2)}`,
        instructions: instructions(query),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
