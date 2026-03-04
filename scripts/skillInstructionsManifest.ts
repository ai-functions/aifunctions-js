/**
 * Default instruction text per skill for syncing to content.
 * Uses default parameters (e.g. maxTopics=5, length=medium) so content has a stable baseline.
 */
export const DEFAULT_SKILL_INSTRUCTIONS: Record<
  string,
  { weak: string; normal: string }
> = {
  extractTopics: {
    weak: `Extract up to 5 topics from the text.
JSON ONLY: {"topics": ["Topic 1", "Topic 2", ...]}
No explanation.`,
    normal: `Extract the most important topics from the provided text.
Return a maximum of 5 topics.
Respond in JSON format with a "topics" array of strings.`,
  },
  extractEntities: {
    weak: `Extract entities: Person, Organization, Location, Date, Product.
JSON ONLY: {"entities": [{"name": "...", "type": "..."}]}
No chat.`,
    normal: `Extract named entities from the text.
Focus on: Person, Organization, Location, Date, Product.
For each, provide name, type, and brief context.
Respond in JSON: {"entities": [{"name": "...", "type": "...", "context": "..."}]}`,
  },
  matchLists: {
    weak: `Match List 1 to List 2.
Guidance: Match by name and semantic similarity.
Output JSON ONLY:
{"matches": [{"source": object, "target": object, "reason": "string"}], "unmatched": []}
No explanation outside JSON. Use exact objects for source/target. Each List 2 item at most once.`,
    normal: `You are an AI assistant specialized in matching items from two lists based on naming and semantic similarity.
Your goal is to find the best match for each item in the first list from the second list.
Strictly follow the user's guidance for matching criteria.
Ignore arbitrary IDs (like UUIDs) unless clearly shared.
Do not match the same List 2 item to more than one List 1 item.
Output your response in valid JSON:
{
    "matches": [{"source": <full object from list1>, "target": <full object from list2>, "reason": "..."}],
    "unmatched": [<full objects from list1 with no match>]
}`,
  },
  summarize: {
    weak: `Summarize text (a concise paragraph).
JSON ONLY: {"summary": "...", "keyPoints": []}`,
    normal: `Summarize the following text.
Length: a concise paragraph.
Extract key points.
JSON: {"summary": "...", "keyPoints": ["...", "..."]}`,
  },
  classify: {
    weak: `Classify into: Category A, Category B.
JSON ONLY: {"categories": ["..."]}`,
    normal: `Classify text into categories: Category A, Category B.
Select exactly one.
JSON: {"categories": ["..."], "confidence": 0-1}`,
  },
  sentiment: {
    weak: `Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".`,
    normal: `Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".`,
  },
  translate: {
    weak: `Translate the following text into the requested language.
Maintain the original tone and context.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".`,
    normal: `Translate the following text into the requested language.
Maintain the original tone and context.
Detect the source language and include it in your response.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".`,
  },
  rank: {
    weak: `Rank the items based on relevance to the query. Provide a score (0-1) and brief reason per item. Respond in JSON with "rankedItems" array. Maintain full original objects in "item" field.`,
    normal: `Rank the following items based on their relevance to the query.
For each item, provide a relevance score between 0 and 1 and a brief reason.
Respond in JSON format with a "rankedItems" array.
Maintain the full original objects in the "item" field.`,
  },
  cluster: {
    weak: `Group the items into semantic clusters. Provide a descriptive label for each cluster. Respond in JSON with "clusters" array. Maintain full original objects in "items" array.`,
    normal: `Group the following items into semantic clusters.
Identify the most natural number of clusters.
Provide a descriptive label for each cluster.
Maintain the full original objects in the "items" array for each cluster.
Respond in JSON format with a "clusters" array.`,
  },
};

/** Default rules per skill for syncing to content (skills/<name>-rules.json). Ensures git has both instructions and rules. */
export type SkillRuleEntry = { rule: string; weight: number };
export const DEFAULT_SKILL_RULES: Record<string, SkillRuleEntry[]> = {
  extractTopics: [{ rule: "Output valid JSON only with a 'topics' array.", weight: 1 }],
  extractEntities: [{ rule: "Output valid JSON only with an 'entities' array.", weight: 1 }],
  matchLists: [
    { rule: "Output valid JSON only with 'matches' and 'unmatched' arrays.", weight: 1 },
    { rule: "Use exact objects from list1/list2 in source/target; do not invent fields.", weight: 1 },
  ],
  summarize: [{ rule: "Output valid JSON with 'summary' and 'keyPoints'.", weight: 1 }],
  classify: [{ rule: "Output valid JSON with 'categories' (and optional 'confidence').", weight: 1 }],
  sentiment: [{ rule: "Output valid JSON with 'sentiment' and 'score'.", weight: 1 }],
  translate: [{ rule: "Output valid JSON with 'translatedText' and 'detectedSourceLanguage'.", weight: 1 }],
  rank: [{ rule: "Output valid JSON with 'rankedItems' array; keep full objects in 'item' field.", weight: 1 }],
  cluster: [{ rule: "Output valid JSON with 'clusters' array; keep full objects in 'items'.", weight: 1 }],
};
