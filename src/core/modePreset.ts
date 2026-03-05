import type { AskOptions, LlmMode } from "./types.js";

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
 * - ultra: same preset as strong (highest tier).
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
    case "ultra":
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

export type ResolvedAskOptions = {
  model?: string;
  temperature: number;
  maxTokens: number;
};

/**
 * Resolve effective model, temperature, and maxTokens when opts.mode is set.
 * Order: explicit opts.model/temperature/maxTokens override; then client config; then env; then preset.
 * For "weak" mode, model lookup uses "normal" (OpenRouter has no weak preset model).
 */
export function resolveOptionsFromMode(
  opts: AskOptions,
  clientModels?: { normal?: string; strong?: string },
  envOverrides?: { normal?: string; strong?: string }
): ResolvedAskOptions {
  if (!opts.mode) {
    return {
      model: opts.model,
      temperature: opts.temperature,
      maxTokens: opts.maxTokens,
    };
  }
  const preset = getModePreset(opts.mode);
  const modeForModel: "normal" | "strong" =
    opts.mode === "weak" || opts.mode === "normal" ? "normal" : "strong";
  const model =
    opts.model ??
    clientModels?.[modeForModel] ??
    envOverrides?.[modeForModel] ??
    preset.model;
  return {
    model,
    temperature: opts.temperature ?? preset.temperature,
    maxTokens: opts.maxTokens ?? preset.maxTokens,
  };
}
