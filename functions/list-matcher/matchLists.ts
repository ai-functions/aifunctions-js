import { callOpenAI } from "../callOpenAI.js";

export interface MatchListsParams {
    list1: any[];
    list2: any[];
    guidance: string;
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

export async function matchLists(params: MatchListsParams): Promise<MatchListsResult> {
    const { list1, list2, guidance, model = "gpt-5-nano", additionalInstructions } = params;

    const systemInstructions = `
You are an AI assistant specialized in matching items from two lists based on naming and semantic similarity.
Your goal is to find the best match for each item in the first list from the second list.
Strictly follow the user's guidance for matching criteria.
Ignore arbitrary IDs (like auto-incrementing integers or UUIDs) unless they are clearly shared between the two lists and intended to be used as keys. Prioritize semantic similarity and naming.

Output your response in valid JSON format with the following structure:
{
    "matches": [
        {
            "source": <the complete JSON object from list1>,
            "target": <the complete JSON object from list2>,
            "reason": "<brief explanation>"
        }
    ],
    "unmatched": [
        <items from list1 that could not be confidently matched>
    ]
}

IMPORTANT: The 'source' and 'target' fields must be the EXACT FULL OBJECTS from the input lists, not just IDs or names.
If 'additionalInstructions' are provided, prioritize them.
    `.trim();

    const userPrompt = `
Here are the two lists to match:

List 1 (Source):
${JSON.stringify(list1, null, 2)}

List 2 (Target):
${JSON.stringify(list2, null, 2)}

Guidance:
${guidance}

${additionalInstructions ? `Additional Instructions:\n${additionalInstructions}` : ""}
    `.trim();

    const result = await callOpenAI<MatchListsResult>({
        model,
        instructions: systemInstructions,
        prompt: userPrompt,
        // Adjust max tokens if needed based on list size, but start with a reasonable default or let callOpenAI handle it
    });

    return result.data;
}
