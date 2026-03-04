/**
 * Unit tests for safeJsonParse. Verifies secure parsing and prototype injection handling.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeJsonParse, JsonParseError, ERR_JSON_PARSE } from "../dist/functions/index.js";

describe("safeJsonParse", () => {
  it("parses valid JSON", () => {
    const out = safeJsonParse('{"a": 1, "b": "x"}');
    assert.deepStrictEqual(out, { a: 1, b: "x" });
  });

  it("parses array", () => {
    const out = safeJsonParse("[1, 2, 3]");
    assert.deepStrictEqual(out, [1, 2, 3]);
  });

  it("throws JsonParseError with code ERR_JSON_PARSE for invalid JSON", () => {
    assert.throws(
      () => safeJsonParse("not json"),
      (e: unknown) => e instanceof JsonParseError && e.code === ERR_JSON_PARSE
    );
  });

  it("throws for truncated JSON", () => {
    assert.throws(
      () => safeJsonParse('{"a": 1'),
      (e: unknown) => e instanceof JsonParseError
    );
  });

  it("removes __proto__ key (no prototype pollution)", () => {
    const out = safeJsonParse('{"__proto__": {"polluted": true}, "x": 1}');
    assert.strictEqual((out as Record<string, unknown>).x, 1);
    assert.strictEqual(Object.prototype.hasOwnProperty.call(out, "__proto__"), false);
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
  });

  it("removes constructor.prototype (no prototype pollution)", () => {
    const out = safeJsonParse(
      '{"constructor": {"prototype": {"polluted": true}}, "y": 2}'
    );
    assert.strictEqual((out as Record<string, unknown>).y, 2);
    assert.strictEqual(({} as Record<string, unknown>).polluted, undefined);
  });
});
