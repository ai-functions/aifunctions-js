/**
 * Standardized executor for all skill functions. Every listed skill runs through this
 * so instruction + rules handling, prompt building, and JSON parsing are consistent.
 */
import { callAI, callAIStream } from "../callAI.js";
import type { StreamChunk } from "../../src/index.js";
import type { ExecuteSkillConfig } from "./types.js";

/**
 * Execute a skill with the given config: build prompt from request, apply instructions
 * and optional rules, call the LLM, return parsed JSON. All built-in skills use this.
 */
export async function executeSkill<T>(config: ExecuteSkillConfig<T>): Promise<T> {
    const {
        request,
        buildPrompt,
        instructions,
        rules,
        client,
        mode = "normal",
        model,
    } = config;
    const prompt = buildPrompt(request);
    const result = await callAI<T>({
        client,
        mode,
        instructions,
        prompt,
        model,
        rules,
    });
    return result.data;
}

/**
 * Streaming variant of executeSkill. Yields text, usage, and done chunks.
 * Use when a skill supports streaming (e.g. summarizeStream).
 */
export async function* executeSkillStream(
    config: ExecuteSkillConfig
): AsyncGenerator<StreamChunk> {
    const { request, buildPrompt, instructions, rules, client, mode = "normal", model } = config;
    const prompt = buildPrompt(request);
    yield* callAIStream({
        client,
        mode,
        instructions,
        prompt,
        model,
        rules,
    });
}
