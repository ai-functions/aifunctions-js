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
  LlmMode,
} from "./core/types.js";
export { getModePreset } from "./core/modePreset.js";
export type { ModePreset } from "./core/modePreset.js";
export { NxAiApiError } from "./core/errors.js";
export type { NxAiApiErrorCode } from "./core/errors.js";

export {
  getSkillsResolver,
  resolveSkillInstructions,
  resolveSkillRules,
  skillInstructionsKeyForMode,
  skillRulesKey,
} from "./content/skillsResolver.js";
export type { SkillsResolverOptions, SkillMode } from "./content/skillsResolver.js";
export { DEFAULT_SKILLS_REPO_URL, DEFAULT_SKILLS_BRANCH } from "./content/skillsRepo.js";
export { pushSkillsContent } from "./content/publishSkills.js";
export type { PushSkillsContentOptions } from "./content/publishSkills.js";

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
