import type {
  AskOptions,
  AskResult,
  CreateClientOptions,
  StreamChunk,
} from "../core/types.js";
import { NxAiApiError } from "../core/errors.js";
import { resolveOptionsFromMode } from "../core/modePreset.js";
import { normalizeUsage } from "../core/usage.js";
import { getLlamaCppEnv } from "../env.js";

type LlamaCppConfig = NonNullable<
  Extract<CreateClientOptions, { backend: "llama-cpp" }>["llamaCpp"]
>;

function buildPrompt(system: string | undefined, instruction: string): string {
  if (system) {
    return `[System]\n${system}\n\n[User]\n${instruction}\n\n[Assistant]\n`;
  }
  return `[User]\n${instruction}\n\n[Assistant]\n`;
}

export function createLlamaCppClient(
  config: Extract<CreateClientOptions, { backend: "llama-cpp" }>
): {
  ask(instruction: string, opts: AskOptions): Promise<AskResult>;
  askStream(instruction: string, opts: AskOptions): AsyncIterable<StreamChunk>;
  testConnection(): Promise<boolean>;
} {
  const env = getLlamaCppEnv();
  const llamaCpp = config.llamaCpp ?? {};
  const modelPath = llamaCpp.modelPath ?? env.modelPath;
  const contextSize = llamaCpp.contextSize ?? env.contextSize ?? 4096;
  const threads = llamaCpp.threads ?? env.threads;

  if (!modelPath) {
    throw new NxAiApiError(
      'Missing llama.cpp modelPath. Set LLAMA_CPP_MODEL_PATH in .env or pass llamaCpp.modelPath.',
      { code: "MISSING_ENV" }
    );
  }

  let model: Awaited<ReturnType<Awaited<ReturnType<typeof getLlama>>["loadModel"]>> | null = null;
  let initPromise: Promise<void> | null = null;

  async function getLlama(): Promise<Awaited<ReturnType<typeof import("node-llama-cpp").getLlama>>> {
    const mod = await import("node-llama-cpp").catch(() => {
      throw new NxAiApiError(
        'Install "node-llama-cpp" to use backend "llama-cpp".',
        { code: "MISSING_OPTIONAL_DEP" }
      );
    });
    return mod.getLlama();
  }

  async function ensureLoaded(): Promise<{ model: NonNullable<typeof model> }> {
    if (model != null) return { model };
    if (initPromise) {
      await initPromise;
      if (model == null) throw new NxAiApiError("Llama init failed", { code: "MISSING_OPTIONAL_DEP" });
      return { model };
    }
    initPromise = (async () => {
      const llama = await getLlama();
      model = await llama.loadModel({ modelPath: modelPath! });
    })();
    await initPromise;
    if (model == null) throw new NxAiApiError("Llama init failed", { code: "MISSING_OPTIONAL_DEP" });
    return { model };
  }

  return {
    async ask(instruction: string, opts: AskOptions): Promise<AskResult> {
      const { model: m } = await ensureLoaded();
      if (!m) throw new NxAiApiError("Llama model not loaded", { code: "MISSING_OPTIONAL_DEP" });

      const resolved = opts.mode ? resolveOptionsFromMode(opts) : opts;
      const prompt = buildPrompt(opts.system, instruction);
      const inputTokens = m.tokenize(prompt);
      const promptTokenCount = inputTokens.length;

      const context = await m.createContext({
        contextSize,
        threads: threads ?? Math.max(1, (await import("os")).cpus().length - 1),
      });
      const sequence = context.getSequence();

      const resTokens: number[] = [];
      const maxTokens = resolved.maxTokens;
      const options = { temperature: resolved.temperature };

      for await (const token of sequence.evaluate(inputTokens, options)) {
        resTokens.push(token);
        if (resTokens.length >= maxTokens) break;
      }

      const text = m.detokenize(resTokens);
      const completionTokenCount = resTokens.length;
      const usage = normalizeUsage({
        prompt_tokens: promptTokenCount,
        completion_tokens: completionTokenCount,
        total_tokens: promptTokenCount + completionTokenCount,
      });

      return { text, usage, raw: undefined };
    },
    async *askStream(instruction: string, opts: AskOptions): AsyncIterable<StreamChunk> {
      const { model: m } = await ensureLoaded();
      if (!m) throw new NxAiApiError("Llama model not loaded", { code: "MISSING_OPTIONAL_DEP" });

      const resolved = opts.mode ? resolveOptionsFromMode(opts) : opts;
      const prompt = buildPrompt(opts.system, instruction);
      const inputTokens = m.tokenize(prompt);
      const promptTokenCount = inputTokens.length;

      const context = await m.createContext({
        contextSize,
        threads: threads ?? Math.max(1, (await import("os")).cpus().length - 1),
      });
      const sequence = context.getSequence();

      const resTokens: number[] = [];
      const maxTokens = resolved.maxTokens;
      const options = { temperature: resolved.temperature };

      for await (const token of sequence.evaluate(inputTokens, options)) {
        resTokens.push(token);
        yield { type: "text", text: m.detokenize([token]) };
        if (resTokens.length >= maxTokens) break;
      }

      const completionTokenCount = resTokens.length;
      const usage = normalizeUsage({
        prompt_tokens: promptTokenCount,
        completion_tokens: completionTokenCount,
        total_tokens: promptTokenCount + completionTokenCount,
      });
      yield { type: "usage", usage };
      yield { type: "done", usage };
    },
    async testConnection(): Promise<boolean> {
      try {
        await ensureLoaded();
        return true;
      } catch {
        return false;
      }
    },
  };
}
