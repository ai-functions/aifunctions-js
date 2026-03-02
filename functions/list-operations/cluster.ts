import { callAI } from "../callAI.js";

export interface ClusterParams {
    items: any[];
    numClusters?: number;
    model?: string;
}

export interface Cluster {
    label: string;
    items: any[];
}

export interface ClusterResult {
    clusters: Cluster[];
}

/**
 * Groups a list of items into semantic clusters.
 */
export async function cluster(params: ClusterParams): Promise<ClusterResult> {
    const { items, numClusters, model = "gpt-4o-mini" } = params;

    const instructions = `
Group the following items into semantic clusters. 
${numClusters ? `Aim for approximately ${numClusters} clusters.` : "Identify the most natural number of clusters."}
Provide a descriptive label for each cluster.
Maintain the full original objects in the "items" array for each cluster.
Respond in JSON format with a "clusters" array.
    `.trim();

    const userPrompt = `
Items to cluster:
${JSON.stringify(items, null, 2)}
    `.trim();

    const result = await callAI<ClusterResult>({
        model,
        instructions: { weak: instructions, strong: instructions },
        prompt: userPrompt,
    });

    return result.data;
}
