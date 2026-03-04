import type { Client, LlmMode } from "../../src/index.js";
import { callAI } from "../callAI.js";

export interface AskParams {
    /** What the model must do. */
    instruction: string;
    /** Description of the required output (e.g. "A single JSON object with keys 'summary' and 'keyPoints'"). */
    outputContract: string;
    /** Optional: input data as a string (Markdown) or object (serialized as JSON in INPUT_MD). */
    inputData?: string | Record<string, unknown>;
    client?: Client;
    mode?: LlmMode;
    model?: string;
}

const WEAK_SYSTEM = "Follow the instruction and respect the output contract. Respond with a single JSON object only. No markdown, no explanation.";
const NORMAL_SYSTEM = "Follow the instruction and respect the output contract. You must respond with exactly one JSON object. Do not wrap in markdown code fences or add any text outside the object.";

function buildInputMd(instruction: string, outputContract: string, inputData?: string | Record<string, unknown>): string {
    const sections: string[] = [
        "# Skill",
        "",
        "## Instruction",
        "",
        instruction,
        "",
        "## Output Contract",
        "",
        outputContract,
    ];
    if (inputData !== undefined) {
        sections.push("", "## Input Data", "");
        if (typeof inputData === "string") {
            sections.push(inputData);
        } else {
            sections.push("```json", JSON.stringify(inputData, null, 2), "```");
        }
    }
    return sections.join("\n");
}

/**
 * Generic "do what the instruction says" skill. Builds INPUT_MD from instruction, outputContract, and optional inputData;
 * uses fixed weak/normal system instructions; calls the LLM and returns parsed JSON.
 */
export async function ask(params: AskParams): Promise<unknown> {
    const { instruction, outputContract, inputData, client, mode, model } = params;
    const prompt = buildInputMd(instruction, outputContract, inputData);
    const result = await callAI<unknown>({
        client,
        mode,
        instructions: { weak: WEAK_SYSTEM, normal: NORMAL_SYSTEM },
        prompt,
        model,
    });
    return result.data;
}
