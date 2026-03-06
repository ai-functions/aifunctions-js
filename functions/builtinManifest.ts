import type { RestrictedJsonSchemaObject } from "../src/content/libraryIndex.js";

export type BuiltInAbilityQuality = {
  confidence: number | null;
  method: "not-judged";
  notes: string[];
};

export type BuiltInAbilityEntry = {
  id: string;
  displayName: string;
  description: string;
  source: { kind: "built-in" };
  runtime: {
    callName: string;
    modes?: ("weak" | "normal" | "strong")[];
    defaults?: Record<string, unknown>;
  };
  io: {
    input: RestrictedJsonSchemaObject;
    output: RestrictedJsonSchemaObject;
  };
  examples: Array<{ input: Record<string, unknown>; output: Record<string, unknown> }>;
  tags: string[];
  quality: BuiltInAbilityQuality;
};

const qualityNotJudged: BuiltInAbilityQuality = {
  confidence: null,
  method: "not-judged",
  notes: ["No quality judge run has been recorded for this built-in function yet."],
};

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[] = []
): RestrictedJsonSchemaObject => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

const stringSchema = { type: "string" } as const;
const numberSchema = { type: "number" } as const;
const booleanSchema = { type: "boolean" } as const;

const buildBase = (
  id: string,
  displayName: string,
  description: string,
  input: RestrictedJsonSchemaObject,
  output: RestrictedJsonSchemaObject,
  defaults: Record<string, unknown> = { mode: "normal" },
  examples: Array<{ input: Record<string, unknown>; output: Record<string, unknown> }> = []
): BuiltInAbilityEntry => ({
  id,
  displayName,
  description,
  source: { kind: "built-in" },
  runtime: {
    callName: id,
    modes: ["weak", "normal", "strong"],
    defaults,
  },
  io: { input, output },
  examples,
  tags: ["built-in"],
  quality: qualityNotJudged,
});

const coreEntries: BuiltInAbilityEntry[] = [
  buildBase(
    "matchLists",
    "Match Lists",
    "Match items from two lists by semantic meaning and naming similarity.",
    objectSchema(
      {
        list1: { type: "array", items: objectSchema({}) },
        list2: { type: "array", items: objectSchema({}) },
        guidance: stringSchema,
        existingMatches: {
          type: "array",
          items: objectSchema({
            source: objectSchema({}),
            target: objectSchema({}),
            reason: stringSchema,
          }),
        },
        additionalInstructions: stringSchema,
        mode: { type: "string", enum: ["weak", "normal", "strong", "ultra"] },
      },
      ["list1", "list2", "guidance"]
    ),
    objectSchema(
      {
        matches: {
          type: "array",
          items: objectSchema({
            source: objectSchema({}),
            target: objectSchema({}),
            reason: stringSchema,
          }, ["source", "target"]),
        },
        unmatched: { type: "array", items: objectSchema({}) },
      },
      ["matches", "unmatched"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "extractTopics",
    "Extract Topics",
    "Extract key topics from input text.",
    objectSchema({ text: stringSchema }, ["text"]),
    objectSchema(
      { topics: { type: "array", items: stringSchema } },
      ["topics"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 },
    [{ input: { text: "Great support with quick resolution." }, output: { topics: ["support", "service quality"] } }]
  ),
  buildBase(
    "extractEntities",
    "Extract Entities",
    "Extract named entities from input text.",
    objectSchema({ text: stringSchema }, ["text"]),
    objectSchema(
      {
        entities: {
          type: "array",
          items: objectSchema(
            {
              name: stringSchema,
              type: stringSchema,
              context: stringSchema,
            },
            ["name", "type"]
          ),
        },
      },
      ["entities"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "summarize",
    "Summarize",
    "Summarize text and extract key points.",
    objectSchema(
      {
        text: stringSchema,
        length: { type: "string", enum: ["brief", "medium", "detailed"] },
        mode: { type: "string", enum: ["weak", "normal", "strong", "ultra"] },
      },
      ["text"]
    ),
    objectSchema(
      {
        summary: stringSchema,
        keyPoints: { type: "array", items: stringSchema },
      },
      ["summary", "keyPoints"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "classify",
    "Classify",
    "Classify text into one or more provided categories.",
    objectSchema(
      {
        text: stringSchema,
        categories: { type: "array", items: stringSchema },
        allowMultiple: booleanSchema,
        mode: { type: "string", enum: ["weak", "normal", "strong", "ultra"] },
      },
      ["text", "categories"]
    ),
    objectSchema(
      {
        categories: { type: "array", items: stringSchema },
        confidence: numberSchema,
      },
      ["categories"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "sentiment",
    "Sentiment",
    "Determine sentiment and confidence score for input text.",
    objectSchema({ text: stringSchema }, ["text"]),
    objectSchema(
      {
        sentiment: { type: "string", enum: ["positive", "negative", "neutral"] },
        score: numberSchema,
      },
      ["sentiment", "score"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "translate",
    "Translate",
    "Translate text to a target language while preserving context.",
    objectSchema(
      {
        text: stringSchema,
        targetLanguage: stringSchema,
      },
      ["text", "targetLanguage"]
    ),
    objectSchema(
      {
        translatedText: stringSchema,
        detectedSourceLanguage: stringSchema,
      },
      ["translatedText", "detectedSourceLanguage"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "rank",
    "Rank",
    "Rank items by relevance to a query.",
    objectSchema(
      {
        query: stringSchema,
        items: { type: "array", items: objectSchema({}) },
      },
      ["query", "items"]
    ),
    objectSchema(
      {
        rankedItems: {
          type: "array",
          items: objectSchema(
            {
              item: objectSchema({}),
              score: numberSchema,
              reason: stringSchema,
            },
            ["item", "score"]
          ),
        },
      },
      ["rankedItems"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "cluster",
    "Cluster",
    "Group items into semantic clusters.",
    objectSchema(
      {
        items: { type: "array", items: objectSchema({}) },
        guidance: stringSchema,
      },
      ["items"]
    ),
    objectSchema(
      {
        clusters: {
          type: "array",
          items: objectSchema(
            {
              label: stringSchema,
              items: { type: "array", items: objectSchema({}) },
            },
            ["label", "items"]
          ),
        },
      },
      ["clusters"]
    ),
    { mode: "normal", temperature: 0.2, maxTokens: 1200 }
  ),
  buildBase(
    "ai.ask",
    "AI Ask",
    "Run a generic AI prompt and return text output.",
    objectSchema(
      {
        prompt: stringSchema,
        mode: { type: "string", enum: ["weak", "normal", "strong", "ultra"] },
        maxTokens: numberSchema,
        temperature: numberSchema,
      },
      ["prompt"]
    ),
    objectSchema({ text: stringSchema }, ["text"]),
    { mode: "normal", temperature: 0.7, maxTokens: 1200 }
  ),
  buildBase(
    "judge",
    "Judge",
    "Score a response against weighted rules.",
    objectSchema(
      {
        instructions: stringSchema,
        response: stringSchema,
        rules: {
          type: "array",
          items: objectSchema({ rule: stringSchema, weight: numberSchema }, ["rule", "weight"]),
        },
        threshold: numberSchema,
        mode: { type: "string", enum: ["normal", "strong"] },
      },
      ["instructions", "response", "rules", "threshold"]
    ),
    objectSchema(
      {
        schemaVersion: stringSchema,
        pass: booleanSchema,
        scoreNormalized: numberSchema,
        summary: stringSchema,
      },
      ["schemaVersion", "pass", "scoreNormalized", "summary"]
    )
  ),
  buildBase(
    "compare",
    "Compare",
    "Compare multiple responses and rank the best candidate.",
    objectSchema(
      {
        instructions: stringSchema,
        responses: {
          type: "array",
          items: objectSchema({ id: stringSchema, text: stringSchema }, ["id", "text"]),
        },
        threshold: numberSchema,
      },
      ["instructions", "responses", "threshold"]
    ),
    objectSchema(
      {
        schemaVersion: stringSchema,
        ranking: { type: "array", items: objectSchema({}) },
        bestId: stringSchema,
        summary: stringSchema,
      },
      ["schemaVersion", "ranking", "bestId", "summary"]
    )
  ),
  buildBase(
    "generateInstructions",
    "Generate Instructions",
    "Generate and iteratively improve instructions from test cases.",
    objectSchema(
      {
        seedInstructions: stringSchema,
        testCases: { type: "array", items: objectSchema({}) },
      },
      ["seedInstructions", "testCases"]
    ),
    objectSchema(
      {
        achieved: booleanSchema,
        best: objectSchema({}),
      },
      ["achieved", "best"]
    )
  ),
  buildBase(
    "optimizeInstructions",
    "Optimize Instructions",
    "Rewrite instructions to improve quality.",
    objectSchema({ instructions: stringSchema }, ["instructions"]),
    objectSchema(
      {
        optimized: stringSchema,
        changes: { type: "array", items: stringSchema },
      },
      ["optimized"]
    )
  ),
  buildBase(
    "fixInstructions",
    "Fix Instructions",
    "Fix instructions based on judge feedback.",
    objectSchema(
      {
        instructions: stringSchema,
        judgeFeedback: objectSchema({}),
      },
      ["instructions", "judgeFeedback"]
    ),
    objectSchema(
      {
        fixedInstructions: stringSchema,
        changes: { type: "array", items: stringSchema },
      },
      ["fixedInstructions"]
    )
  ),
  buildBase(
    "generateRule",
    "Generate Rule",
    "Generate one weighted judge rule from instructions/context.",
    objectSchema({ instructions: stringSchema }, ["instructions"]),
    objectSchema(
      {
        rule: objectSchema({ rule: stringSchema, weight: numberSchema }, ["rule", "weight"]),
      },
      ["rule"]
    )
  ),
  buildBase(
    "generateJudgeRules",
    "Generate Judge Rules",
    "Generate a set of weighted judge rules.",
    objectSchema({ instructions: stringSchema }, ["instructions"]),
    objectSchema(
      {
        rules: {
          type: "array",
          items: objectSchema({ rule: stringSchema, weight: numberSchema }, ["rule", "weight"]),
        },
      },
      ["rules"]
    )
  ),
  buildBase(
    "raceModels",
    "Race Models",
    "Benchmark candidate models on shared test cases.",
    objectSchema(
      {
        taskName: stringSchema,
        testCases: { type: "array", items: objectSchema({}) },
        models: { type: "array", items: objectSchema({}) },
      },
      ["taskName", "testCases", "models"]
    ),
    objectSchema(
      {
        ranking: { type: "array", items: objectSchema({}) },
        bestModelId: stringSchema,
      },
      ["ranking", "bestModelId"]
    )
  ),
  buildBase(
    "collectionMapping",
    "Collection Mapping",
    "Infer collection and field mappings between two schemas.",
    objectSchema(
      {
        left: objectSchema({}),
        right: objectSchema({}),
      },
      ["left", "right"]
    ),
    objectSchema(
      {
        schemaVersion: stringSchema,
        collectionMatchConfidence: numberSchema,
        fieldMappings: { type: "array", items: objectSchema({}) },
      },
      ["schemaVersion", "collectionMatchConfidence", "fieldMappings"]
    )
  ),
  buildBase(
    "validateFieldRelationship",
    "Validate Field Relationship",
    "Validate whether two fields represent the same semantic relationship.",
    objectSchema(
      {
        leftField: objectSchema({}),
        rightField: objectSchema({}),
      },
      ["leftField", "rightField"]
    ),
    objectSchema(
      {
        valid: booleanSchema,
        confidence: numberSchema,
        reason: stringSchema,
      },
      ["valid"]
    )
  ),
  buildBase(
    "suggestFieldRelationship",
    "Suggest Field Relationship",
    "Suggest relationship type and confidence between two fields.",
    objectSchema(
      {
        leftField: objectSchema({}),
        rightField: objectSchema({}),
      },
      ["leftField", "rightField"]
    ),
    objectSchema(
      {
        relationship: stringSchema,
        confidence: numberSchema,
        reason: stringSchema,
      },
      ["relationship"]
    )
  ),
  buildBase(
    "ai.normalize-judge-rules.v1",
    "Normalize Judge Rules",
    "Normalize and sanitize judge rules.",
    objectSchema(
      {
        rules: {
          type: "array",
          items: objectSchema({ rule: stringSchema, weight: numberSchema }, ["rule", "weight"]),
        },
      },
      ["rules"]
    ),
    objectSchema(
      {
        rules: {
          type: "array",
          items: objectSchema({ rule: stringSchema, weight: numberSchema }, ["rule", "weight"]),
        },
      },
      ["rules"]
    )
  ),
  buildBase(
    "ai.aggregate-judge-feedback.v1",
    "Aggregate Judge Feedback",
    "Aggregate multiple judge outputs into a single feedback report.",
    objectSchema(
      {
        evaluations: { type: "array", items: objectSchema({}) },
      },
      ["evaluations"]
    ),
    objectSchema(
      {
        summary: stringSchema,
        issues: { type: "array", items: stringSchema },
      },
      ["summary", "issues"]
    )
  ),
];

export function getBuiltInAbilityManifest(): BuiltInAbilityEntry[] {
  return coreEntries.map((entry) => ({
    ...entry,
    source: { ...entry.source },
    runtime: { ...entry.runtime, defaults: { ...(entry.runtime.defaults ?? {}) } },
    io: { input: { ...entry.io.input }, output: { ...entry.io.output } },
    examples: [...entry.examples],
    tags: [...entry.tags],
    quality: { ...entry.quality, notes: [...entry.quality.notes] },
  }));
}
