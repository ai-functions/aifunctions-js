/**
 * Unit tests for validateJson (Ajv-based). No API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateJson } from "../dist/functions/index.js";

const schema = {
  type: "object",
  required: ["id", "value"],
  properties: {
    id: { type: "string" },
    value: { type: "number", minimum: 0, maximum: 1 },
  },
  additionalProperties: false,
};

describe("validateJson", () => {
  it("returns ok: true for valid data", async () => {
    const result = await validateJson("test", { id: "x", value: 0.5 }, { schema });
    assert.strictEqual(result.ok, true);
  });

  it("returns ok: false with path and message for missing required", async () => {
    const result = await validateJson("test", { id: "x" }, { schema });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.errorCode, "ERR_SCHEMA_INVALID");
      assert.ok(Array.isArray(result.errors));
      assert.ok(result.errors.some((e) => e.path.includes("value") || e.message.includes("value")));
    }
  });

  it("returns ok: false for value out of range", async () => {
    const result = await validateJson("test", { id: "x", value: 2 }, { schema });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.strictEqual(result.errorCode, "ERR_SCHEMA_INVALID");
      assert.ok(result.errors.length >= 1);
      assert.ok(result.errors.every((e) => typeof e.path === "string" && typeof e.message === "string"));
    }
  });

  it("returns ok: false for additional property when additionalProperties false", async () => {
    const result = await validateJson("test", { id: "x", value: 0, extra: 1 }, { schema });
    assert.strictEqual(result.ok, false);
    if (!result.ok) {
      assert.ok(result.errors.some((e) => e.path.includes("extra") || e.message.includes("additional")));
    }
  });

  it("returns ok: true when no schema resolved", async () => {
    const result = await validateJson("nonexistent", { anything: true });
    assert.strictEqual(result.ok, true);
  });
});
