/**
 * Reads model overrides for mode "normal" and "strong" (e.g. LLM_MODEL_NORMAL, LLM_MODEL_STRONG).
 * When set, these override the built-in preset models so deployers can set the strong model without code changes.
 */
export function getModelOverrides(): {
  normal: string | undefined;
  strong: string | undefined;
} {
  return {
    normal: process.env.LLM_MODEL_NORMAL || process.env.AI_MODEL_NORMAL,
    strong: process.env.LLM_MODEL_STRONG || process.env.AI_MODEL_STRONG,
  };
}

/**
 * Reads OpenRouter-related env vars. Does not throw; returns undefined for missing values.
 */
export function getOpenRouterEnv(): {
  apiKey: string | undefined;
  appUrl: string | undefined;
  appName: string | undefined;
} {
  return {
    apiKey: process.env.OPENROUTER_API_KEY || process.env.OPEN_ROUTER_KEY,
    appUrl: process.env.OPENROUTER_APP_URL,
    appName: process.env.OPENROUTER_APP_NAME,
  };
}

/**
 * Reads llama.cpp-related env vars.
 */
export function getLlamaCppEnv(): {
  modelPath: string | undefined;
  threads: number | undefined;
  contextSize: number | undefined;
} {
  return {
    modelPath: process.env.LLAMA_CPP_MODEL_PATH || "./models/model.gguf",
    threads: process.env.LLAMA_CPP_THREADS ? parseInt(process.env.LLAMA_CPP_THREADS, 10) : undefined,
    contextSize: process.env.LLAMA_CPP_CONTEXT_SIZE
      ? parseInt(process.env.LLAMA_CPP_CONTEXT_SIZE, 10)
      : 4096,
  };
}

/**
 * Reads Transformers.js-related env vars.
 */
export function getTransformersJsEnv(): {
  modelId: string | undefined;
  cacheDir: string | undefined;
} {
  return {
    modelId: process.env.TRANSFORMERS_JS_MODEL_ID || "Xenova/tiny-random-Gpt2",
    cacheDir: process.env.TRANSFORMERS_JS_CACHE_DIR,
  };
}
