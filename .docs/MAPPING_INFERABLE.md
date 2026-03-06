# What a person infers (collection, field, edges) — and what’s missing

This doc lists what a human would infer about a **collection**, a **field**, and the **edges** between collections. The goal is to see what already exists in your mapping vs what’s missing (or only in the edges and easy to miss).

---

## 1. Collection-level (what you infer about the *collection*)

| Inferred | Description | Where it might live today | Missing? |
|----------|-------------|---------------------------|----------|
| **What it is** | Domain concept (e.g. "vulnerability groups", "users", "orders") | Maybe `_classification` / purpose at collection doc? | Often no single “collection document” with a label/description. |
| **Primary key** | Which field(s) uniquely identify a row | — | Not declared; you infer from `_id` or naming. |
| **Natural vs surrogate key** | Business key vs internal ID | — | Not modeled. |
| **Outgoing edges** | “This collection references X, Y via fields F1, F2” | Could be the *union* of all field `relationship.kind: foreign` in this collection | If you only have field docs, you have to aggregate. No first-class “collection edges out”. |
| **Incoming edges** | “This collection is referenced by A, B” | Inverse of other collections’ `relationship.target` pointing here | Not explicit; you’d compute from all field relationships. |
| **Cardinality in the graph** | Leaf vs hub (many refs in vs out) | — | Not stored. |
| **Lineage / source** | Where the data came from (pipeline, snapshot, API) | Maybe in collection-level metadata? | Unclear. |
| **Lifecycle** | Append-only, mutable, snapshot, TTL | — | Not modeled. |

So: a lot of **collection-level** inference (identity, keys, “this collection’s role in the graph”) doesn’t exist in one place; some of it could be derived from edges if edges were first-class.

---

## 2. Field-level (what you infer about the *field*)

| Inferred | Description | Where it might live today | Missing? |
|----------|-------------|---------------------------|----------|
| **Semantic type** | Identifier, reference, quantity, code, date, free text, enum-like, blob | `_classification.purpose` (e.g. meaningful-domain-field) is partial | No explicit “semantic type” (identifier, reference, quantity, code, …). |
| **Key role** | Part of primary key? Natural key? Foreign key? | We added `relationship.kind: foreign`; no “primary key” / “natural key” flag | PK/natural key not declared. |
| **Units** | For quantities (e.g. ms, bytes, count) | — | Not in current field shape. |
| **Constraints** | Required, unique, format, range, regex | — | Not modeled. |
| **Enum / code set** | Allowed values or link to a code list | `data.sampleValues` hints; no “allowedValues” or “codeListRef” | Not first-class. |
| **Derivation** | Computed from other fields? Formula? | `relationship.kind: computed` exists but no “derivedFrom” | Partial. |
| **Sensitivity / PII** | PII, confidential, internal-only | — | Not in current shape. |
| **Foreign / target / connection** | What it points to, role, cardinality | We added `relationship` (kind, target, role, inverseRole, cardinality) | Implemented. |
| **Storage ref / identity** | Where the field lives (e.g. storageRef) | `_system.storageRef` | Exists. |
| **Sample values** | Evidence for type and relationship | `data.sampleValues` | Exists. |
| **Provenance / field role** | e.g. provenance-metadata | `metadata.fieldRole` | Exists. |

So: **relationship** is there; **semantic type**, **key role**, **constraints**, **units**, **enum/code set**, **derivation**, **sensitivity** are the main field-level gaps.

---

## 3. Edges (collection → collection, “the juicy stuff for navigation”)

What a person infers: “Collection A connects to collection B *via* field F; the relationship is many-to-one, role X, inverse Y.” That’s an **edge** in a graph where nodes are collections.

| Inferred | Description | Where it might live | Missing? |
|----------|-------------|---------------------|----------|
| **From collection** | Source node | — | If edges are first-class: fromCollection (or from storageRef). |
| **To collection** | Target node | `field.relationship.target` | Same as target in field.relationship. |
| **Via field** | Which field on the source carries the link | The field that has `relationship.kind: foreign` | On the field doc. |
| **To field** | Which field on the target (e.g. primary key) | `field.relationship.target.targetField` | We have it. |
| **Role / inverse / cardinality** | How the link is named and cardinality | `field.relationship.role`, inverseRole, cardinality | We have it. |
| **Edge identity** | Stable ID for the edge (e.g. for lineage or UI) | — | Usually not stored; you might derive from “fromRef + toRef + fromField”. |

So the **information** for navigation is already on the **field** (`relationship`). What’s often missing is a **first-class edge index**: a list of “all edges” (fromCollection, toCollection, fromField, toField, role, cardinality) so you don’t have to scan every field doc to know “what does this collection point to?”. That could be:

- **Derived**: build an edge list from all field docs that have `relationship.kind === "foreign"`.
- **Stored**: a separate store (e.g. “edges” collection or file) that mirrors or replaces field-level relationship for navigation.

If “it’s in the edges” and you’re missing it, it might mean: (1) the edges are stored somewhere (e.g. another collection or service) and not in the field docs, or (2) the edges are only implicit (field.relationship) and there’s no aggregated view. Either way, a single **edge list** (collection A, collection B, via field, role, cardinality) would make “all the things a person infers about how collections connect” visible in one place.

---

## 4. Summary: what’s missing and where it could live

- **Collection-level:** What the collection is, primary/natural key, outgoing/incoming edges summary, lineage, lifecycle. Could live in a **collection document** (one per collection) or in an **edge index** (edges + optional collection metadata).
- **Field-level:** Semantic type, key role (PK/natural), units, constraints, enum/code set, derivation details, sensitivity. Could extend the **field document** (and our `FieldMappingDocument` / relationship types) with optional blocks (e.g. `semanticType`, `keyRole`, `constraints`, `units`).
- **Edges:** First-class **edge list** (fromCollection, toCollection, fromField, toField, role, cardinality) so navigation doesn’t require scanning every field. Could be derived from field `relationship` or stored separately; either way, “the edges” are the place where “how things connect” is visible at a glance.

If you tell me where your edges *do* live (same store as field docs, another collection, another repo), we can align types and validators (and suggest/validate) to that shape so nothing’s missing from the AI’s view.
