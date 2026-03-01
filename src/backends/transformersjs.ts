import type { AskOptions, AskResult, CreateClientOptions } from "../core/types.js";
import { NxAiApiError } from "../core/errors.js";
import { normalizeUsage } from "../core/usage.js";

type TransformersJsConfig = NonNullable<
  Extract<CreateClientOptions, { backend: "transformersjs" }>["transformersjs"]
>;

function buildPrompt(system: string | undefined, instruction: string): string {
  if (system) {
    return `[System]\n${system}\n\n[User]\n${instruction}\n\n[Assistant]\n`;
  }
  return `[User]\n${instruction}\n\n[Assistant]\n`;
}

export function createTransformersJsClient(
  config: Extract<CreateClientOptions, { backend: "transformersjs" }>
): { ask(instruction: string, opts: AskOptions): Promise<AskResult> } {
  const transformersjs: TransformersJsConfig = config.transformersjs;
  let pipeline: Awaited<ReturnType<typeof import("@huggingface/transformers").pipeline>> | null =
    null;
  let initPromise: Promise<void> | null = null;

  async function ensureLoaded(): Promise<NonNullable<typeof pipeline>> {
    if (pipeline != null) return pipeline;
    if (initPromise) {
      await initPromise;
      if (pipeline == null) throw new Error("Transformers.js init failed");
      return pipeline;
    }
    initPromise = (async () => {
      let pipelineFn: typeof import("@huggingface/transformers").pipeline;
      try {
        const tf = await import("@huggingface/transformers");
        pipelineFn = tf.pipeline;
      } catch {
        throw new NxAiApiError(
          'Install "@huggingface/transformers" to use backend "transformersjs".',
          { code: "MISSING_OPTIONAL_DEP" }
        );
      }
      pipeline = await pipelineFn("text-generation", transformersjs.modelId, {
        ...(transformersjs.cacheDir && { cache_dir: transformersjs.cacheDir }),
      });
    })();
    await initPromise;
    if (pipeline == null) throw new Error("Transformers.js init failed");
    return pipeline;
  }

  return {
    async ask(instruction: string, opts: AskOptions): Promise<AskResult> {
      const pipe = await ensureLoaded();
      const prompt = buildPrompt(opts.system, instruction);

      const out = await pipe(prompt, {
        max_new_tokens: opts.maxTokens,
        temperature: opts.temperature,
        do_sample: opts.temperature > 0,
      });

      const generated = (Array.isArray(out) ? out[0] : out) as { generated_text?: string } | undefined;
      const fullText =
        typeof generated?.generated_text === "string" ? generated.generated_text : "";
      const text = fullText.slice(prompt.length).trim();

      // Approximate token counts (tokenization varies by model)
      const promptTokens = Math.ceil(prompt.length / 4);
      const completionTokens = Math.ceil(text.length / 4);

      const usage = normalizeUsage({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      });

      return { text, usage, raw: out };
    },
  };
}
