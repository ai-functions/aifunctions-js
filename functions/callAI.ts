import { createClient, type Client, type AskResult, type StreamChunk } from "../src/index.js";

export interface CallAIParams {
    client?: Client;
    mode?: "weak" | "strong";
    instructions: {
        weak: string;
        strong: string;
    };
    prompt: string;
    model?: string; // Optional override for cloud models
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
 * Common wrapper for calling AI models in nx-ai-api functions.
 * Handles switching between weak/strong instructions and sanitizes JSON output.
 */
export async function callAI<T>(params: CallAIParams): Promise<CallAIResult<T>> {
    const {
        client: providedClient,
        mode = "strong",
        instructions,
        prompt,
        model
    } = params;

    // Use provided client or default to OpenRouter (strong)
    const client = providedClient || createClient({ backend: "openrouter" });

    const instruction = mode === "weak" ? instructions.weak : instructions.strong;

    // Local models (weak) often need more explicit prompting to stay in JSON mode
    // even with the system instruction, so we combine them if needed or just pass as is.
    const res = await client.ask(prompt, {
        system: instruction,
        model: model, // Only used by OpenRouter
        maxTokens: 4096,
        temperature: mode === "weak" ? 0.1 : 0.7, // Lower temp for weak models to improve reliability
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
        mode = "strong",
        instructions,
        prompt,
        model,
    } = params;

    const client = providedClient || createClient({ backend: "openrouter" });
    const instruction = mode === "weak" ? instructions.weak : instructions.strong;
    const opts = {
        system: instruction,
        model,
        maxTokens: 4096,
        temperature: mode === "weak" ? 0.1 : 0.7,
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
