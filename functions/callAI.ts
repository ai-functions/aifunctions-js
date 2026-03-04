import {
    createClient,
    getModePreset,
    type Client,
    type AskResult,
    type StreamChunk,
    type LlmMode,
} from "../src/index.js";

export type { LlmMode };

export interface CallAIParams {
    client?: Client;
    mode?: LlmMode;
    instructions: {
        weak: string;
        normal: string;
        strong?: string;
    };
    prompt: string;
    model?: string;
}

export interface CallAIResult<T> {
    data: T;
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    raw: AskResult;
}

/**
 * Common wrapper for calling AI models in light-skills functions.
 * Uses mode presets: weak = llama-cpp (Llama 2.0; no key), normal = openrouter gpt-5-nano, strong = openrouter gpt-5.2.
 * Strong instructions fall back to normal when not provided.
 */
export async function callAI<T>(params: CallAIParams): Promise<CallAIResult<T>> {
    const {
        client: providedClient,
        mode = "normal",
        instructions,
        prompt,
        model: modelOverride,
    } = params;

    const preset = getModePreset(mode);
    const client = providedClient || createClient({ backend: preset.backend });
    const model =
        modelOverride ?? (preset.backend === "openrouter" ? preset.model : undefined);
    const instruction =
        mode === "weak"
            ? instructions.weak
            : mode === "strong"
              ? (instructions.strong ?? instructions.normal)
              : instructions.normal;

    const res = await client.ask(prompt, {
        system: instruction,
        model,
        maxTokens: preset.maxTokens,
        temperature: preset.temperature,
    });

    let text = res.text.trim();

    // Sanitization: Local models often wrap JSON in markdown blocks
    if (text.startsWith("```")) {
        text = text.replace(/^```[a-z]*\n/i, "").replace(/\n```$/g, "").trim();
    }

    try {
        const data = JSON.parse(text) as T;
        return {
            data,
            usage: {
                promptTokens: res.usage.prompt_tokens,
                completionTokens: res.usage.completion_tokens,
                totalTokens: res.usage.total_tokens,
            },
            raw: res,
        };
    } catch (e) {
        throw new Error(`Failed to parse AI response as JSON: ${text.substring(0, 500)}... Error: ${e instanceof Error ? e.message : String(e)}`);
    }
}

/**
 * Streaming variant of callAI. Yields text chunks (and usage/done) from the model.
 * Use when you want to stream tokens to the client (e.g. SSE or chunked HTTP).
 * If the client does not support askStream, falls back to a single ask() and yields one text chunk.
 * For JSON-mode functions, accumulate the text and parse when you receive type "done".
 */
export async function* callAIStream(params: CallAIParams): AsyncGenerator<StreamChunk> {
    const {
        client: providedClient,
        mode = "normal",
        instructions,
        prompt,
        model: modelOverride,
    } = params;

    const preset = getModePreset(mode);
    const client = providedClient || createClient({ backend: preset.backend });
    const model =
        modelOverride ?? (preset.backend === "openrouter" ? preset.model : undefined);
    const instruction =
        mode === "weak"
            ? instructions.weak
            : mode === "strong"
              ? (instructions.strong ?? instructions.normal)
              : instructions.normal;
    const opts = {
        system: instruction,
        model,
        maxTokens: preset.maxTokens,
        temperature: preset.temperature,
    };

    if (typeof client.askStream === "function") {
        yield* client.askStream(prompt, opts);
        return;
    }

    const res = await client.ask(prompt, opts);
    if (res.text) yield { type: "text", text: res.text };
    yield { type: "usage", usage: res.usage };
    yield { type: "done", usage: res.usage };
}
