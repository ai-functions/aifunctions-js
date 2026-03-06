/**
 * AI utility functions for light-skills.
 * Importable via: import { ... } from "light-skills/functions"
 */

export { matchLists } from "./list-matcher/matchLists.js";
export type { MatchListsParams, MatchListsResult, MatchResult } from "./list-matcher/matchLists.js";

export { extractTopics } from "./extraction/extractTopics.js";
export type { ExtractTopicsParams, ExtractTopicsResult } from "./extraction/extractTopics.js";

export { extractEntities } from "./extraction/extractEntities.js";
export type { ExtractEntitiesParams, ExtractEntitiesResult, Entity } from "./extraction/extractEntities.js";

export { summarize, summarizeStream } from "./text/summarize.js";
export type { SummarizeParams, SummarizeResult } from "./text/summarize.js";

export { classify } from "./text/classify.js";
export type { ClassifyParams, ClassifyResult } from "./text/classify.js";

export { sentiment } from "./text/sentiment.js";
export type { SentimentParams, SentimentResult } from "./text/sentiment.js";

export { translate } from "./text/translate.js";
export type { TranslateParams, TranslateResult } from "./text/translate.js";

export { rank } from "./list-operations/rank.js";
export type { RankParams, RankResult, RankedItem } from "./list-operations/rank.js";

export { cluster } from "./list-operations/cluster.js";
export type { ClusterParams, ClusterResult, Cluster } from "./list-operations/cluster.js";

export { callAI, callAIStream, formatRulesForInstruction } from "./callAI.js";
export type { CallAIParams, CallAIResult, CallAIRule, SkillRunOptions, LlmMode } from "./callAI.js";

export { executeSkill, executeSkillStream, buildRequestPrompt } from "./core/index.js";
export type { ExecuteSkillConfig, SkillInstructions } from "./core/index.js";

export { extractFirstJson, extractFirstJsonObject, NoJsonFoundError } from "./jsonHelpers.js";
export type {
  ExtractFirstJsonResult,
  ExtractFirstJsonSuccess,
  ExtractFirstJsonFailure,
  ExtractFirstJsonObjectResult,
} from "./jsonHelpers.js";

export { runJsonCompletion } from "./runJsonCompletion.js";
export type { RunJsonCompletionOptions } from "./runJsonCompletion.js";

export type {
  AiJsonResult,
  AiJsonSuccess,
  AiJsonError,
  AiJsonErrorCode,
  AiJsonValidation,
  ValidationOk,
  ValidationFail,
} from "./aiJsonTypes.js";
export {
  ERR_NO_JSON_FOUND,
  ERR_JSON_PARSE,
  ERR_SCHEMA_INVALID,
  isAiJsonError,
  isAiJsonSuccess,
} from "./aiJsonTypes.js";

export { safeJsonParse, JsonParseError } from "./safeJsonParse.js";

export { parseJsonResponse } from "./parseJsonResponse.js";
export type {
    ParseJsonResponseOptions,
    ParseJsonResponseResult,
    ParseJsonResponseSuccess,
    ParseJsonResponseFailure,
} from "./parseJsonResponse.js";

export { askJson, toCallAIResult } from "./askJson.js";
export type { AskJsonParams } from "./askJson.js";

export { ask } from "./ai/ask.js";
export type { AskParams } from "./ai/ask.js";

export { optimizeInstruction } from "./optimizeInstruction.js";
export type { OptimizeInstructionResult, OptimizeInstructionOptions } from "./optimizeInstruction.js";

export { run, runWithContent, runSkill, getSkillNames, getSkillNamesAsync } from "./router.js";
export type {
  ContentSkillMode,
  RunWithContentOptions,
  RunOptions,
  RunResultWithValidation,
  RunSkillMode,
  RunSkillParams,
  RunSkillResult,
} from "./router.js";

export type { JudgeRule, JudgeOutput, WeightScale } from "./judge/types.js";
export {
  normalizeJudgeRules,
  aggregateJudgeFeedback,
  judge,
  judgeV1,
  fixInstructions,
  fixInstructionsV1,
  generateRule,
  generateRuleV1,
  generateJudgeRules,
  generateJudgeRulesV1,
  optimizeInstructions,
  optimizeInstructionsV1,
  optimizeJudgeRules,
  optimizeJudgeRulesV1,
} from "./judge/index.js";
export type {
  NormalizeJudgeRulesRequest,
  NormalizeJudgeRulesOutput,
  AggregateJudgeFeedbackRequest,
  AggregateJudgeFeedbackOutput,
  JudgeRequest,
  FixInstructionsRequest,
  FixInstructionsOutput,
  GenerateRuleRequest,
  GenerateRuleOutput,
  GenerateJudgeRulesRequest,
  GenerateJudgeRulesOutput,
  OptimizeInstructionsRequest,
  OptimizeInstructionsOutput,
  OptimizeJudgeRulesRequest,
  OptimizeJudgeRulesOutput,
} from "./judge/index.js";

export {
  compare,
  compareV1,
  raceModels,
  raceModelsV1,
  generateInstructions,
  generateInstructionsV1,
} from "./orchestration/index.js";
export type {
  CompareRequest,
  CompareOutput,
  RaceModelsRequest,
  RaceModelsOutput,
  GenerateInstructionsRequest,
  GenerateInstructionsOutput,
} from "./orchestration/index.js";

export { collectionMapping, collectionMappingV1 } from "./recordsMapper/index.js";
export type {
  CollectionMappingRequest,
  CollectionMappingOutput,
  CollectionSummary,
} from "./recordsMapper/index.js";

export { validateOutput, validateAgainstSchema, validateJson, validateFieldRelationship, suggestFieldRelationship } from "./validate/index.js";
export type {
  ValidateOutputResult,
  ValidateOutputOptions,
  ValidationResult,
  ValidationResultOk,
  ValidationResultFail,
  FieldRelationship,
  FieldMappingDocument,
  FieldInferable,
  CollectionInferable,
  EdgeInferable,
  FieldSemanticType,
  FieldKeyRole,
  FieldConstraints,
  ValidateFieldRelationshipRequest,
  ValidateFieldRelationshipOutput,
  SuggestFieldRelationshipRequest,
  SuggestFieldRelationshipOutput,
} from "./validate/index.js";
