/**
 * Mapping types: what a person would infer about collection, field, and edges.
 * See .docs/MAPPING_INFERABLE.md for what exists vs what's missing.
 * These types describe the full shape; many fields are optional until we store them.
 */

/** Relationship block on a field: foreign, target, how it connects (navigation). */
export type FieldRelationship = {
  kind: "foreign" | "local" | "computed" | "none";
  target?: {
    storageRef?: string;
    targetField?: string;
    targetEntity?: string;
    collection?: string;
  };
  role?: string;
  inverseRole?: string;
  cardinality?: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
};

/** Semantic type of a field (what a person would infer). */
export type FieldSemanticType =
  | "identifier"
  | "reference"
  | "quantity"
  | "code"
  | "date"
  | "free-text"
  | "enum-like"
  | "blob"
  | "unknown";

/** Key role: is this field part of primary key, natural key, or just a foreign key? */
export type FieldKeyRole = "primary" | "natural" | "foreign" | "none";

/** Constraints a person would infer (required, unique, format, range). */
export type FieldConstraints = {
  required?: boolean;
  unique?: boolean;
  format?: string;
  min?: number;
  max?: number;
  pattern?: string;
  allowedValues?: string[];
  codeListRef?: string;
};

/** What can be inferred about a single field (full inferable set). */
export type FieldInferable = {
  /** Storage/system identity (you have this). */
  storageRef?: string;
  /** Source collection (you have this). */
  source?: { server?: string; database?: string; collection?: string };
  /** Provenance role (you have this). */
  fieldRole?: string;
  /** Sample values (you have this). */
  sampleValues?: string[];
  /** Purpose/classification (you have this). */
  purpose?: string[];
  /** Relationship: foreign, target, how it connects (you have this). */
  relationship?: FieldRelationship;
  /** Semantic type (missing in many mappings). */
  semanticType?: FieldSemanticType;
  /** Key role: primary, natural, foreign (missing). */
  keyRole?: FieldKeyRole;
  /** Units for quantities (missing). */
  units?: string;
  /** Constraints (missing). */
  constraints?: FieldConstraints;
  /** Derived from other fields? (partial: kind computed exists). */
  derivedFrom?: string[];
  /** Sensitivity / PII (missing). */
  sensitivity?: "internal" | "confidential" | "pii" | "public";
};

/** What can be inferred about a collection (often missing as a single document). */
export type CollectionInferable = {
  /** Storage identity. */
  server?: string;
  database?: string;
  collection?: string;
  /** What the collection is (domain concept). */
  label?: string;
  description?: string;
  /** Primary key field(s). */
  primaryKey?: string[];
  /** Natural key field(s) if different. */
  naturalKey?: string[];
  /** Outgoing edges: collection refs this collection via these fields. */
  edgesOut?: EdgeInferable[];
  /** Incoming edges: these collections reference this one. */
  edgesIn?: EdgeInferable[];
  /** Lineage / source pipeline. */
  lineage?: string;
  /** Lifecycle: append-only, mutable, snapshot. */
  lifecycle?: "append-only" | "mutable" | "snapshot";
};

/** Raw field mapping document shape (as stored: _header, _system, metadata, data, relationship). */
export type FieldMappingDocument = {
  _header?: { thingType?: string; namespace?: string; kind?: string };
  _classification?: { purpose?: string[]; why?: { label?: string; explanation?: string } };
  _system?: { refRaw?: string; refNorm?: string; storageRef?: string };
  metadata?: { source?: { server?: string; database?: string; collection?: string }; fieldRole?: string };
  data?: { sampleValues?: string[] };
  relationship?: FieldRelationship;
};

/** First-class edge: from collection → to collection via a field (the "juicy" navigation bit). */
export type EdgeInferable = {
  /** Source collection (storage ref or db.collection). */
  fromRef: string;
  /** Target collection. */
  toRef: string;
  /** Field on source that carries the link. */
  fromField: string;
  /** Field on target (e.g. primary key). */
  toField?: string;
  /** Role name (e.g. "belongsTo"). */
  role?: string;
  /** Inverse role (e.g. "hasMany"). */
  inverseRole?: string;
  cardinality?: "one-to-one" | "one-to-many" | "many-to-one" | "many-to-many";
};
