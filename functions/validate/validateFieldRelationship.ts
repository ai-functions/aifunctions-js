/**
 * validateFieldRelationship — AI validates relationship metadata on a field mapping document.
 * Checks: is foreign/target/connection info present when needed? Consistent with data and purpose?
 * No AI needed to *store* the relationship block; AI validates that it's correct and complete.
 */
import type { Client, LlmMode } from "../../src/index.js";
import { executeSkill } from "../core/executor.js";
import type { SkillInstructions } from "../core/types.js";
import type { FieldRelationship, FieldMappingDocument } from "./mappingTypes.js";

export type { FieldRelationship, FieldMappingDocument } from "./mappingTypes.js";

export type ValidateFieldRelationshipRequest = {
  /** The field mapping document to validate (must include metadata + data; relationship may be missing or partial). */
  field: FieldMappingDocument;
  /** Optional list of known target refs (e.g. storageRefs or "db.collection") so the AI can check "does target exist?". */
  knownTargets?: string[];
  mode?: LlmMode;
  client?: Client;
};

export type ValidateFieldRelationshipOutput = {
  valid: boolean;
  errors: string[];
  suggestions?: string[];
  /** AI's short assessment of the relationship block (or what's missing). */
  relationshipAssessment?: string;
};

const SYSTEM = `You validate the "relationship" block on a field mapping document.
The relationship block describes: is this field a foreign key (kind: foreign), what it targets (target.storageRef, targetField), and how it connects (role, inverseRole, cardinality). This enables navigation without AI.

You must:
1. If the field looks like a reference/ID (e.g. fieldRole hint, purpose, or sample values that look like IDs) but has no relationship or relationship.kind is not "foreign", add an error and suggest adding a relationship block.
2. If relationship.kind is "foreign", require target.storageRef or target.collection + target.targetField; otherwise add an error.
3. If relationship is present, check consistency: do sample values (if any) plausibly align with a link to that target? Is role/cardinality reasonable?
4. If knownTargets are provided and relationship.target points somewhere, check that the target appears in knownTargets (or is clearly a valid ref); if not, add a warning in suggestions.
5. Return ONLY a JSON object with: valid (boolean), errors (string[]), suggestions (string[] optional), relationshipAssessment (string optional, one paragraph). No markdown.`;

function buildPrompt(req: ValidateFieldRelationshipRequest): string {
  const parts = [
    "# validateFieldRelationship",
    "",
    "## Field document (excerpt)",
    "```json",
    JSON.stringify(
      {
        _system: req.field._system,
        metadata: req.field.metadata,
        data: req.field.data,
        _classification: req.field._classification,
        relationship: req.field.relationship,
      },
      null,
      2
    ),
    "```",
  ];
  if (req.knownTargets && req.knownTargets.length > 0) {
    parts.push("", "## Known targets (valid storageRef / collection references)");
    parts.push(req.knownTargets.slice(0, 100).join("\n"));
  }
  parts.push("", "Return one JSON object: { valid, errors, suggestions?, relationshipAssessment? }.");
  return parts.join("\n");
}

const INSTRUCTIONS: SkillInstructions = {
  weak: SYSTEM,
  normal: SYSTEM,
  strong: SYSTEM,
};

export async function validateFieldRelationship(
  request: ValidateFieldRelationshipRequest,
  opts?: { client?: Client }
): Promise<ValidateFieldRelationshipOutput> {
  const client = request.client ?? opts?.client;
  const res = await executeSkill({
    request: { ...request, knownTargets: request.knownTargets ?? [] },
    buildPrompt: (r) => buildPrompt(r as ValidateFieldRelationshipRequest),
    instructions: { weak: INSTRUCTIONS.weak, normal: INSTRUCTIONS.normal, strong: INSTRUCTIONS.strong },
    rules: [],
    client,
    mode: (request.mode ?? "normal") as "weak" | "normal" | "strong",
  });
  const out = res as unknown as ValidateFieldRelationshipOutput;
  if (typeof out.valid !== "boolean") {
    return { valid: false, errors: ["AI response missing valid"], relationshipAssessment: "Invalid response shape." };
  }
  if (!Array.isArray(out.errors)) {
    out.errors = [];
  }
  return {
    valid: out.valid,
    errors: out.errors,
    suggestions: Array.isArray(out.suggestions) ? out.suggestions : undefined,
    relationshipAssessment: typeof out.relationshipAssessment === "string" ? out.relationshipAssessment : undefined,
  };
}

// --- Suggest what makes sense ---

export type SuggestFieldRelationshipRequest = {
  /** The field mapping document (metadata + data; relationship may be missing). */
  field: FieldMappingDocument;
  /** Optional list of known target refs so the AI can pick a plausible target. */
  knownTargets?: string[];
  mode?: LlmMode;
  client?: Client;
};

export type SuggestFieldRelationshipOutput = {
  /** Suggested relationship block (what would make sense for this field). */
  suggestedRelationship: FieldRelationship;
  /** Short explanation of why this makes sense (e.g. "Sample values look like IDs; fieldRole suggests reference."). */
  explanation?: string;
  /** Confidence 0–1 that this suggestion is appropriate. */
  confidence?: number;
};

const SUGGEST_SYSTEM = `You suggest a "relationship" block for a field mapping document so that navigation (foreign keys, targets, how things connect) can be done from data without AI.

Given the field's metadata (source collection, fieldRole), classification (purpose), and data (sampleValues), infer what makes sense:
- kind: "foreign" if the field clearly references another entity/collection (e.g. IDs, refs, fieldRole hint); "local" if it's just data on this entity; "computed" if derived; "none" if not applicable.
- If kind is "foreign", suggest target (storageRef or collection + targetField) and optionally role, inverseRole, cardinality. Use knownTargets when provided to pick a plausible target.
- If kind is "local" or "none", omit target and connection fields or leave them empty.

Return ONLY a JSON object with: suggestedRelationship (object with kind, target?, role?, inverseRole?, cardinality?), explanation (string, one or two sentences), confidence (number 0–1). No markdown.`;

function buildSuggestPrompt(req: SuggestFieldRelationshipRequest): string {
  const parts = [
    "# suggestFieldRelationship",
    "",
    "## Field document (excerpt)",
    "```json",
    JSON.stringify(
      {
        _system: req.field._system,
        metadata: req.field.metadata,
        data: req.field.data,
        _classification: req.field._classification,
        relationship: req.field.relationship,
      },
      null,
      2
    ),
    "```",
  ];
  if (req.knownTargets && req.knownTargets.length > 0) {
    parts.push("", "## Known targets (valid storageRef / collection references)");
    parts.push(req.knownTargets.slice(0, 100).join("\n"));
  }
  parts.push("", "Return one JSON object: { suggestedRelationship, explanation?, confidence? }.");
  return parts.join("\n");
}

const SUGGEST_INSTRUCTIONS: SkillInstructions = {
  weak: SUGGEST_SYSTEM,
  normal: SUGGEST_SYSTEM,
  strong: SUGGEST_SYSTEM,
};

export async function suggestFieldRelationship(
  request: SuggestFieldRelationshipRequest,
  opts?: { client?: Client }
): Promise<SuggestFieldRelationshipOutput> {
  const client = request.client ?? opts?.client;
  const res = await executeSkill({
    request: { ...request, knownTargets: request.knownTargets ?? [] },
    buildPrompt: (r) => buildSuggestPrompt(r as SuggestFieldRelationshipRequest),
    instructions: SUGGEST_INSTRUCTIONS,
    rules: [],
    client,
    mode: (request.mode ?? "normal") as "weak" | "normal" | "strong",
  });
  const out = res as unknown as SuggestFieldRelationshipOutput;
  if (!out || typeof out.suggestedRelationship !== "object") {
    return {
      suggestedRelationship: { kind: "none" },
      explanation: "Could not infer relationship.",
      confidence: 0,
    };
  }
  return {
    suggestedRelationship: out.suggestedRelationship,
    explanation: typeof out.explanation === "string" ? out.explanation : undefined,
    confidence: typeof out.confidence === "number" ? out.confidence : undefined,
  };
}
