export type BackendKind = "openrouter" | "llama-cpp" | "transformersjs";

/** LLM capability level: weak (local, e.g. Llama 2.0), normal (default cloud), strong (highest capability). */
export type LlmMode = "weak" | "normal" | "strong" | "ultra";

/** Chunk yielded from askStream(); usage may follow at end. */
export type StreamChunk =
  | { type: "text"; text: string }
  | { type: "usage"; usage: Usage }
  | { type: "done"; usage?: Usage };

export type Client = {
  ask(instruction: string, opts: AskOptions): Promise<AskResult>;
  /** Optional: stream tokens/chunks. Not all backends implement this. */
  askStream?(instruction: string, opts: AskOptions): AsyncIterable<StreamChunk>;
  testConnection(): Promise<boolean>;
};

/**
 * Attribution metadata attached to an LLM request.
 * functionId is always present (auto-injected by the server layer).
 * projectId, traceId, and tags are optional and provided by the caller at runtime.
 */
export type AttributionContext = {
  /** Auto-injected: identifies which package function originated this call (e.g. "extract.requirements"). */
  functionId: string;
  /** Optional: logical project or tenant identifier (e.g. "cognni-prod"). */
  projectId?: string;
  /** Optional: request correlation ID. Auto-generated UUID when not provided by caller. */
  traceId?: string;
  /** Optional: flexible key-value metadata for grouping/filtering in analytics. */
  tags?: Record<string, string>;
};

export type AskOptions = {
  maxTokens: number;
  temperature: number;
  /** OpenRouter only: e.g. "openai/gpt-4o" or any OpenRouter model slug. When mode is set, resolved from config/env/preset if omitted. */
  model?: string;
  /** Resolve model (and optionally temperature/maxTokens) from configured presets. Explicit model/temperature/maxTokens override. */
  mode?: LlmMode;
  /** OpenRouter only: provider routing preference */
  vendor?: string | string[];
  /** Optional system prompt */
  system?: string;
  /** Request timeout in ms; default 60_000 */
  timeoutMs?: number;
  /** Attribution metadata injected by the server layer. Skill functions do not set this directly. */
  attribution?: AttributionContext;
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
    /** Override which model is used for mode "normal" and "strong". Env LLM_MODEL_NORMAL / LLM_MODEL_STRONG override defaults when set. */
    models?: { normal?: string; strong?: string };
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
