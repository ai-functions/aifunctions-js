import type { Client, LlmMode } from "../src/index.js";
import { callAI } from "./callAI.js";
import type { CallAIResult } from "./callAI.js";

export interface AskJsonParams<T = unknown> {
    prompt: string;
    instructions: {
        weak: string;
        normal: string;
        strong?: string;
    };
    /** Optional: human-readable description of the required output (e.g. "A single JSON object with keys 'summary' and 'keyPoints'"). */
    outputContract?: string;
    /** Optional: JSON schema or shape description for the output. */
    requiredOutputShape?: string;
    client?: Client;
    mode?: LlmMode;
    model?: string;
}

const SINGLE_JSON_WEAK = "Respond with a single JSON object only. No markdown, no explanation.";
const SINGLE_JSON_NORMAL = "You must respond with exactly one JSON object. Do not wrap in markdown code fences or add any text outside the object.";

/**
 * LLM call with an explicit "single JSON object only" guarantee. Builds the system instruction
 * from your instructions plus a single-JSON constraint and optional outputContract / requiredOutputShape.
 *
 * @returns Parsed JSON as CallAIResult<T>.
 */
export async function askJson<T = unknown>(params: AskJsonParams<T>): Promise<CallAIResult<T>> {
    const {
        prompt,
        instructions,
        outputContract,
        requiredOutputShape,
        client,
        mode,
        model,
    } = params;

    const singleJsonWeak = SINGLE_JSON_WEAK + (outputContract ? ` ${outputContract}` : "");
    const singleJsonNormal =
        SINGLE_JSON_NORMAL +
        (outputContract ? ` Output must satisfy: ${outputContract}` : "") +
        (requiredOutputShape ? ` Shape: ${requiredOutputShape}` : "");

    const combinedInstructions = {
        weak: `${instructions.weak}\n\n${singleJsonWeak}`.trim(),
        normal: `${instructions.normal}\n\n${singleJsonNormal}`.trim(),
        strong: instructions.strong
            ? `${instructions.strong}\n\n${singleJsonNormal}`.trim()
            : undefined,
    };

    return callAI<T>({
        client,
        mode,
        instructions: combinedInstructions,
        prompt,
        model,
    });
}
