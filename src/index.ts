import type { Client, CreateClientOptions } from "./core/types.js";
import { createOpenRouterClient } from "./backends/openrouter.js";
import { createLlamaCppClient } from "./backends/llamaCpp.js";
import { createTransformersJsClient } from "./backends/transformersjs.js";

export type {
  BackendKind,
  Client,
  AskOptions,
  AskResult,
  Usage,
  StreamChunk,
  CreateClientOptions,
} from "./core/types.js";
export { NxAiApiError } from "./core/errors.js";
export type { NxAiApiErrorCode } from "./core/errors.js";

export function createClient(config: CreateClientOptions): Client {
  switch (config.backend) {
    case "openrouter":
      return createOpenRouterClient(config);
    case "llama-cpp":
      return createLlamaCppClient(config);
    case "transformersjs":
      return createTransformersJsClient(config);
    default: {
      const _: never = config;
      throw new Error(`Unknown backend: ${JSON.stringify((config as { backend: string }).backend)}`);
    }
  }
}
