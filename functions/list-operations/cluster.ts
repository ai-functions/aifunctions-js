import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { Client, LlmMode } from "../../src/index.js";

export interface ClusterParams {
    items: any[];
    numClusters?: number;
    mode?: LlmMode;
    client?: Client;
    model?: string;
}

export interface Cluster {
    label: string;
    items: any[];
}

export interface ClusterResult {
    clusters: Cluster[];
}

function instructions(numClusters?: number): SkillInstructions {
    const base = `Group the following items into semantic clusters.
${numClusters ? `Aim for approximately ${numClusters} clusters.` : "Identify the most natural number of clusters."}
Provide a descriptive label for each cluster.
Maintain the full original objects in the "items" array for each cluster.
Respond in JSON format with a "clusters" array.`;
    return { weak: base.trim(), normal: base.trim() };
}

/**
 * Groups a list of items into semantic clusters.
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function cluster(params: ClusterParams, opts?: SkillRunOptions): Promise<ClusterResult> {
    const { items, numClusters, mode = "normal", client, model } = params;
    return executeSkill<ClusterResult>({
        request: params,
        buildPrompt: (req) => `Items to cluster:\n${JSON.stringify((req as ClusterParams).items, null, 2)}`,
        instructions: instructions(numClusters),
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
