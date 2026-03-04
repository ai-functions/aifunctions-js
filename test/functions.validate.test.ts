/**
 * Unit tests for contract-stability validation (validateAgainstSchema, validateOutput).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateAgainstSchema, validateOutput } from "../dist/functions/index.js";
import type { RestrictedJsonSchemaObject } from "../dist/src/index.js";

describe("validateAgainstSchema", () => {
  it("returns valid for object matching schema", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    };
    const result = validateAgainstSchema({ a: "x", b: 1 }, schema);
    assert.strictEqual(result.valid, true);
  });

  it("returns invalid when required property is missing", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" } },
      required: ["a"],
    };
    const result = validateAgainstSchema({}, schema);
    assert.strictEqual(result.valid, false);
    assert.ok(Array.isArray(result.errors) && result.errors.length > 0);
    assert.ok(result.errors!.some((e) => e.includes("missing required")));
  });

  it("returns invalid when additional property is present and additionalProperties is false", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      additionalProperties: false,
      properties: { a: { type: "string" } },
    };
    const result = validateAgainstSchema({ a: "x", extra: 1 }, schema);
    assert.strictEqual(result.valid, false);
    assert.ok(result.errors!.some((e) => e.includes("unknown property")));
  });

  it("validates number minimum/maximum", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      properties: { n: { type: "number", minimum: 0, maximum: 1 } },
    };
    assert.strictEqual(validateAgainstSchema({ n: 0.5 }, schema).valid, true);
    assert.strictEqual(validateAgainstSchema({ n: -1 }, schema).valid, false);
    assert.strictEqual(validateAgainstSchema({ n: 2 }, schema).valid, false);
  });

  it("validates array items", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", properties: { x: { type: "string" } } } },
      },
    };
    assert.strictEqual(validateAgainstSchema({ items: [{ x: "a" }] }, schema).valid, true);
    assert.strictEqual(validateAgainstSchema({ items: [{ x: 1 }] }, schema).valid, false);
  });
});

describe("validateOutput", () => {
  it("returns valid when outputSchema is provided and value matches", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      properties: { ok: { type: "boolean" } },
    };
    return validateOutput("test.skill.v1", { ok: true }, { outputSchema: schema }).then((r) => {
      assert.strictEqual(r.valid, true);
    });
  });

  it("returns invalid when outputSchema is provided and value does not match", () => {
    const schema: RestrictedJsonSchemaObject = {
      type: "object",
      required: ["ok"],
      properties: { ok: { type: "boolean" } },
    };
    return validateOutput("test.skill.v1", {}, { outputSchema: schema }).then((r) => {
      assert.strictEqual(r.valid, false);
      assert.ok(r.errors && r.errors.length > 0);
    });
  });

  it("returns valid when no resolver and no outputSchema (no-op)", () => {
    return validateOutput("any.skill", { anything: 1 }).then((r) => {
      assert.strictEqual(r.valid, true);
    });
  });
});
