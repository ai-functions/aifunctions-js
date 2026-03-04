import type { Client, LlmMode } from "../../src/index.js";
import type { CallAIRule } from "../callAI.js";

/** Instruction set per mode for the executor. */
export type SkillInstructions = {
    weak: string;
    normal: string;
    strong?: string;
};

/** Config for the standardized skill executor. All skills use this shape. */
export type ExecuteSkillConfig<T = unknown> = {
    /** The request payload (params) for the skill. */
    request: unknown;
    /** Build the user prompt string from the request. Standardized per skill. */
    buildPrompt: (request: unknown) => string;
    /** System instructions per mode (weak / normal / strong). */
    instructions: SkillInstructions;
    /** Optional rules (e.g. from content) appended to the system instruction. */
    rules?: CallAIRule[];
    /** Optional client; default from mode preset. */
    client?: Client;
    /** Mode for preset and instruction variant. Default "normal". */
    mode?: LlmMode;
    /** Optional model override. */
    model?: string;
};
