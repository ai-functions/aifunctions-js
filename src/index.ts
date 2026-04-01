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
  AttributionContext,
  ResponseFormat,
  ResponseNormalization,
} from "./core/types.js";
export {
  DEFAULT_REASONING_BLOCK_PATTERNS,
  stripMarkdownFences,
  stripReasoningBlocksFromText,
  extractBalancedJsonObject,
  normalizeAndParseJsonObjectResponse,
  applyResponseFormatToAskResult,
  openRouterResponseFormatBody,
} from "./core/responseNormalization.js";
export { extractAttribution } from "./serve/attribution.js";
export {
  wrapWithUsageTracking,
  toUsageResponse,
} from "./serve/usageTracker.js";
export type {
  TrackedUsage,
  UsageTracker,
  UsageResponse,
  CostEstimate,
  CostEstimateStatus,
  CostEstimateConfidence,
  CostEstimateReasonCode,
  CostEstimateSource,
} from "./serve/usageTracker.js";
export { getModePreset, resolveOptionsFromMode } from "./core/modePreset.js";
export type { ModePreset, ResolvedAskOptions } from "./core/modePreset.js";
export { NxAiApiError } from "./core/errors.js";
export type { NxAiApiErrorCode } from "./core/errors.js";

export {
  createFunctionContentProvider,
  getDefaultContentProvider,
} from "./content/createFunctionContentProvider.js";
export { ResolverBackedContentProvider } from "./content/resolverBackedContentProvider.js";
export type {
  AiFunctionsContentConfig,
  FunctionContentProvider,
  GetFunctionContentInput,
  HasFunctionInput,
  InlineFunctionDefinition,
  InstructionMode,
  ListFunctionsInput,
  ResolvedFunctionContent,
  SharedStoreConfig,
  StoreClient,
} from "./content/functionContentProvider.js";
export {
  FunctionContentError,
  FunctionContentNotFoundError,
  FunctionContentParseError,
  FunctionContentConfigError,
} from "./content/functionContentErrors.js";
export { getStoreKeys } from "./content/storeKeys.js";
export type { FunctionStoreKeys } from "./content/storeKeys.js";

export {
  getSkillsResolver,
  getSkillNamesFromContent,
  getSkillInstructions,
  setSkillInstructions,
  getSkillRules,
  setSkillRules,
  getSkillInstructionVersions,
  getSkillRulesVersions,
  getSkillInstructionsAtRef,
  getSkillRulesAtRef,
  setSkillInstructionsActiveVersion,
  setSkillRulesActiveVersion,
  resolveSkillInstructions,
  resolveSkillRules,
  skillInstructionsKeyForMode,
  skillRulesKey,
  getSkillTestCases,
  setSkillTestCases,
  getFunctionMeta,
  setFunctionMeta,
  skillTestCasesKey,
  functionMetaKey,
} from "./content/skillsResolver.js";
export {
  generateExamplesForFunction,
  parseGenerateExamplesResponse,
} from "./content/generateExamples.js";
export type { GeneratedExample } from "./content/generateExamples.js";
export type {
  SkillsResolverOptions,
  SkillMode,
  SkillRule,
  SkillVersionEntry,
  SetActiveVersionOptions,
  SkillTestCase,
  FunctionStatus,
  FunctionMeta,
} from "./content/skillsResolver.js";
export {
  getProfiles,
  getRaceConfig,
  setRaceConfig,
  setProfiles,
  setDefaults,
  getRaces,
  appendRace,
  getRaceReport,
  listRaces,
  readRace,
} from "./content/raceStorage.js";
export type {
  RaceProfile,
  RaceProfileKey,
  RaceConfig,
  RaceAttempt,
  RaceRecord,
  GetRaceReportOptions,
} from "./content/raceStorage.js";

export type {
  EvaluationSession,
  AppliedProfileSet,
  ScopeRelease,
  RuntimeResolutionInput,
  RuntimeResolution,
  ResolvedRuntime,
  ProfileKey,
} from "./content/scopedRuntime.js";
export { resolveRuntime } from "./content/runtimeResolver.js";
export type { ResolveRuntimeOptions } from "./content/runtimeResolver.js";
export { resolve as resolveRuntimeService, getEffectiveDefinition } from "./domain/runtimeResolutionService.js";
export type { RuntimeResolutionServiceOptions, GetEffectiveDefinitionOptions } from "./domain/runtimeResolutionService.js";
export type { AiFunctionRunInput } from "./types/run.js";
export { effectiveDefinitionHash, judgeRulesHash } from "./domain/hash.js";
export {
  getAppliedProfileSet,
  setAppliedProfileSet,
  getEffectiveProfiles,
} from "./content/appliedProfileStore.js";
export { saveEvaluationSession, getEvaluationSession } from "./content/evaluationSessionStore.js";
export { applyEvaluation } from "./domain/applyEvaluationService.js";
export type { ApplyEvaluationInput } from "./domain/applyEvaluationService.js";
export { createRelease, getReleases, getRelease } from "./domain/releaseService.js";
export type { CreateReleaseInput } from "./domain/releaseService.js";
export { saveScopeRelease, getScopeRelease, listScopeReleases } from "./content/scopeReleaseStore.js";

export {
  DEFAULT_SKILLS_REPO_URL,
  DEFAULT_SKILLS_BRANCH,
  getSkillsRepoUrl,
} from "./content/skillsRepo.js";
export { pushSkillsContent } from "./content/publishSkills.js";
export type { PushSkillsContentOptions } from "./content/publishSkills.js";

export {
  getLibraryIndex,
  LIBRARY_INDEX_FALLBACK_REL,
  getBuiltInAbilityEntries,
  updateLibraryIndex,
  validateLibraryIndex,
  validateSkillIndexEntry,
} from "./content/libraryIndex.js";
export {
  buildFullLibrarySnapshot,
  writeFullLibrarySnapshot,
  DEFAULT_FULL_LIBRARY_DOCS_PATH,
} from "./content/fullLibrarySnapshot.js";
export type {
  AggregateIndex,
  BuiltInSkillSource,
  GetLibraryIndexOptions,
  IndexMeta,
  RestrictedJsonSchemaObject,
  SkillQuality,
  SkillQualityMethod,
  SkillIndexEntry,
  SkillIO,
  SkillRuntime,
  SkillSource,
  SourceFile,
  SourceFileKind,
  UpdateLibraryIndexOptions,
  UpdateLibraryIndexReport,
  ValidationResult,
} from "./content/libraryIndex.js";
export { getBuiltInAbilityManifest } from "../functions/builtinManifest.js";
export type {
  BuiltInAbilityEntry,
  BuiltInAbilityQuality,
} from "../functions/builtinManifest.js";
export type {
  BuildFullLibrarySnapshotOptions,
  FullEmbeddedFile,
  FullLibrarySkillEntry,
  FullLibrarySnapshot,
} from "./content/fullLibrarySnapshot.js";
export {
  dedupeFunctionIds,
  normalizeFunctionId,
  runAllFunctionsCoverage,
} from "./content/coverageOrchestrator.js";
export type {
  CoverageDeps,
  CoverageOptions,
  CoverageReport,
  CoverageRule,
  CoverageTestCase,
  CoverageResultStatus,
  FunctionCoverageStatus,
} from "./content/coverageOrchestrator.js";
export { parseUpdateLibraryIndexCliArgs } from "./content/updateLibraryIndexCli.js";
export type { UpdateLibraryIndexCliArgs } from "./content/updateLibraryIndexCli.js";

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
