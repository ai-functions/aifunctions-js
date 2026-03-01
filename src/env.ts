/**
 * Reads OpenRouter-related env vars. Does not throw; returns undefined for missing values.
 */
export function getOpenRouterEnv(): {
  apiKey: string | undefined;
  appUrl: string | undefined;
  appName: string | undefined;
} {
  return {
    apiKey: process.env.OPENROUTER_API_KEY,
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
    modelPath: process.env.LLAMA_CPP_MODEL_PATH,
    threads: process.env.LLAMA_CPP_THREADS ? parseInt(process.env.LLAMA_CPP_THREADS, 10) : undefined,
    contextSize: process.env.LLAMA_CPP_CONTEXT_SIZE
      ? parseInt(process.env.LLAMA_CPP_CONTEXT_SIZE, 10)
      : undefined,
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
    modelId: process.env.TRANSFORMERS_JS_MODEL_ID,
    cacheDir: process.env.TRANSFORMERS_JS_CACHE_DIR,
  };
}
