/**
 * AI utility functions for nx-ai-api.
 * Importable via: import { ... } from "nx-ai-api/functions"
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

export { callAI, callAIStream } from "./callAI.js";
export type { CallAIParams, CallAIResult } from "./callAI.js";
