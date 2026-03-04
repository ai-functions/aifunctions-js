/**
 * recordsMapper.collectionMapping.v1 — given two collection summaries → mapping JSON (typed).
 * Modes: weak / normal / strong. See docs/FUNCTIONS_SPEC.md §4.
 */
import type { Client, LlmMode } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";

export type CollectionSummary = {
  server: string;
  db: string;
  collection: string;
  fields: Array<{
    name: string;
    inferredType?: string;
    sampleValues?: string[];
  }>;
};

export type CollectionMappingRequest = {
  left: CollectionSummary;
  right: CollectionSummary;
  constraints?: { maxFieldMappings?: number };
  mode?: LlmMode;
  client?: Client;
  model?: string;
};

export type CollectionMappingOutput = {
  schemaVersion: "xmemory.records-mapper.llm.collection-mapping.v1";
  collectionMatchConfidence: number;
  reason?: string;
  fieldMappings: Array<{
    leftField: string;
    rightField: string;
    confidence: number;
    reason?: string;
  }>;
  notes?: string[];
};

function fieldsToMdList(fields: CollectionSummary["fields"]): string {
  return fields
    .map(
      (f) =>
        `- ${f.name}${f.inferredType ? ` (${f.inferredType})` : ""}${f.sampleValues?.length ? ` sample: ${f.sampleValues.slice(0, 3).join(", ")}` : ""}`
    )
    .join("\n");
}

const SYSTEM_STRONG = `You are recordsMapper.collectionMapping.v1.
Output ONLY one JSON object with schemaVersion "xmemory.records-mapper.llm.collection-mapping.v1".
Never invent field names; only use names from provided lists.
Prefer precision; omit uncertain mappings.
No markdown or extra text.`;

const SYSTEM_NORMAL = SYSTEM_STRONG;

const SYSTEM_WEAK = `Output JSON ONLY. One object. No extra text.
Do NOT invent fields. If unsure, omit mapping or set confidence <= 0.6.
Respect maxFieldMappings.`;

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM_WEAK,
  normal: SYSTEM_NORMAL,
  strong: SYSTEM_STRONG,
};

function buildPrompt(req: CollectionMappingRequest): string {
  const leftFields = fieldsToMdList(req.left.fields);
  const rightFields = fieldsToMdList(req.right.fields);
  const maxMappings = req.constraints?.maxFieldMappings ?? 50;
  return [
    "# recordsMapper.collectionMapping.v1",
    "",
    "## Left Collection",
    `- server: ${req.left.server}, db: ${req.left.db}, collection: ${req.left.collection}`,
    "### Fields",
    leftFields,
    "",
    "## Right Collection",
    `- server: ${req.right.server}, db: ${req.right.db}, collection: ${req.right.collection}`,
    "### Fields",
    rightFields,
    "",
    "## Constraints",
    `- maxFieldMappings: ${maxMappings}`,
    "",
    "## Output Schema",
    "(schemaVersion must be xmemory.records-mapper.llm.collection-mapping.v1)",
  ].join("\n");
}

export async function collectionMappingV1(
  request: CollectionMappingRequest
): Promise<CollectionMappingOutput> {
  const result = await executeSkill<CollectionMappingOutput>({
    request,
    buildPrompt: (r) => buildPrompt(r as CollectionMappingRequest),
    instructions: INSTRUCTIONS,
    client: request.client,
    mode: request.mode ?? "normal",
    model: request.model,
  });
  return result;
}
