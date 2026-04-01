import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractFirstJsonObject,
  NoJsonFoundError,
  ERR_NO_JSON_FOUND,
} from "../dist/functions/index.js";

describe("extractFirstJsonObject", () => {
  it("returns parsed from leading commentary", () => {
    const out = extractFirstJsonObject('Here is the result: {"a": 1}');
    assert.deepStrictEqual(out.parsed, { a: 1 });
    assert.deepStrictEqual(JSON.parse(out.jsonText), { a: 1 });
  });

  it("returns parsed from trailing commentary", () => {
    const out = extractFirstJsonObject('{"x": 42} and that was the answer.');
    assert.deepStrictEqual(out.parsed, { x: 42 });
    assert.ok(out.jsonText.includes('"x"'));
  });

  it("prefers fenced json block when present", () => {
    const text = "Some text\n```json\n{ \"x\": 2 }\n```\nMore text\n{ \"y\": 3 }";
    const out = extractFirstJsonObject(text);
    assert.deepStrictEqual(out.parsed, { x: 2 });
    assert.strictEqual(out.jsonText.trim(), '{ "x": 2 }');
  });

  it("handles pure JSON response", () => {
    const out = extractFirstJsonObject('{"id":"v1","n":0}');
    assert.deepStrictEqual(out.parsed, { id: "v1", n: 0 });
    assert.strictEqual(out.jsonText, '{"id":"v1","n":0}');
  });

  it("handles first JSON array", () => {
    const out = extractFirstJsonObject("pre [1, 2, 3] post");
    assert.deepStrictEqual(out.parsed, [1, 2, 3]);
    assert.ok(out.jsonText.startsWith("["));
  });

  it("throws when no JSON found", () => {
    assert.throws(
      () => extractFirstJsonObject("no json here"),
      (e) => e instanceof NoJsonFoundError && e.code === ERR_NO_JSON_FOUND
    );
  });

  it("throws for empty string", () => {
    assert.throws(
      () => extractFirstJsonObject(""),
      (e) => e instanceof NoJsonFoundError
    );
  });

  it("throws for non-string input", () => {
    assert.throws(
      () => extractFirstJsonObject(null),
      /Input must be a string|input must be a string/
    );
  });

  it("handles multiple objects and returns first", () => {
    const out = extractFirstJsonObject('{"first": 1} {"second": 2}');
    assert.deepStrictEqual(out.parsed, { first: 1 });
  });

  it("handles nested object", () => {
    const out = extractFirstJsonObject('pre {"a": {"b": {"c": 3}}} post');
    assert.deepStrictEqual(out.parsed, { a: { b: { c: 3 } } });
  });

  it("handles fenced block without json label", () => {
    const out = extractFirstJsonObject("```\n{\"k\": true}\n```");
    assert.deepStrictEqual(out.parsed, { k: true });
  });
});
