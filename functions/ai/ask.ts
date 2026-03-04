import type { Client, LlmMode } from "../../src/index.js";
import { type SkillRunOptions } from "../callAI.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";

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

/** SYSTEM templates per mode (see docs/FUNCTIONS_SPEC.md). */
const INSTRUCTIONS: SkillInstructions = {
    weak: "You are ai.ask. Follow the instruction exactly. If JSON is requested: output ONLY a single JSON object. First char must be { and last char must be }. No text before/after.",
    normal: "You are ai.ask. Follow the instruction exactly. Do not add extra text unless asked. If JSON-only is requested, output JSON only (no markdown, no code fences).",
    strong: "You are ai.ask. Follow the instruction exactly. Do not add extra text unless asked. If JSON-only is requested, output JSON only (no markdown, no code fences).",
};

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
 * When run via run() with a resolver, opts.rules from content are applied automatically.
 */
export async function ask(params: AskParams, opts?: SkillRunOptions): Promise<unknown> {
    const { instruction, outputContract, inputData, client, mode, model } = params;
    return executeSkill<unknown>({
        request: params,
        buildPrompt: (req) => {
            const p = req as AskParams;
            return buildInputMd(p.instruction, p.outputContract, p.inputData);
        },
        instructions: INSTRUCTIONS,
        rules: opts?.rules,
        client,
        mode,
        model,
    });
}
