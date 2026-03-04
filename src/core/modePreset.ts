import type { LlmMode } from "./types.js";

export type ModePreset = {
  backend: "llama-cpp" | "openrouter";
  /** Only used when backend is openrouter. */
  model?: string;
  temperature: number;
  maxTokens: number;
};

/**
 * Default presets per mode. Used by callAI when client/model/options are not overridden.
 * - weak: local llama-cpp (Llama 2.0 via model path; no API key); low temp, 4096 tokens.
 * - normal: openrouter gpt-5-nano; 0.7 temp, 4096 tokens.
 * - strong: openrouter gpt-5.2; 0.7 temp, 8192 tokens.
 */
export function getModePreset(mode: LlmMode): ModePreset {
  switch (mode) {
    case "weak":
      return {
        backend: "llama-cpp",
        temperature: 0.1,
        maxTokens: 4096,
      };
    case "normal":
      return {
        backend: "openrouter",
        model: "gpt-5-nano",
        temperature: 0.7,
        maxTokens: 4096,
      };
    case "strong":
      return {
        backend: "openrouter",
        model: "gpt-5.2",
        temperature: 0.7,
        maxTokens: 8192,
      };
    default: {
      const _: never = mode;
      return getModePreset("normal");
    }
  }
}
