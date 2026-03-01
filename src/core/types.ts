export type BackendKind = "openrouter" | "llama-cpp" | "transformersjs";

export type Client = {
  ask(instruction: string, opts: AskOptions): Promise<AskResult>;
};

export type AskOptions = {
  maxTokens: number;
  temperature: number;
  /** OpenRouter only: e.g. "openai/gpt-4o" or any OpenRouter model slug */
  model?: string;
  /** OpenRouter only: provider routing preference */
  vendor?: string | string[];
  /** Optional system prompt */
  system?: string;
  /** Request timeout in ms; default 60_000 */
  timeoutMs?: number;
};

export type AskResult = {
  text: string;
  usage: Usage;
  /** Actual model used if known */
  model?: string;
  /** Full backend response (opt-in) */
  raw?: unknown;
};

export type Usage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  [k: string]: unknown;
};

export type CreateClientOptions =
  | {
      backend: "openrouter";
      openrouter?: {
        apiKey?: string;
        baseUrl?: string;
        appUrl?: string;
        appName?: string;
        allowFallbacksDefault?: boolean;
      };
    }
  | {
      backend: "llama-cpp";
      llamaCpp?: {
        modelPath?: string;
        contextSize?: number;
        threads?: number;
      };
    }
  | {
      backend: "transformersjs";
      transformersjs?: {
        modelId?: string;
        cacheDir?: string;
        device?: "cpu";
      };
    };
