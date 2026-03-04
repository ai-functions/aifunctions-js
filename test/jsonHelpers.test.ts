/**
 * Unit tests for extractFirstJson and extractFirstJsonObject. No API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  extractFirstJson,
  extractFirstJsonObject,
  NoJsonFoundError,
  ERR_NO_JSON_FOUND,
} from "../dist/functions/index.js";

describe("extractFirstJson", () => {
  it("extracts and parses first JSON object in plain text", () => {
    const r = extractFirstJson('Some text then {"a": 1} more.');
    assert.strictEqual(r.ok, true);
    assert.ok("data" in r);
    assert.deepStrictEqual((r as { data: unknown }).data, { a: 1 });
  });

  it("returns first object when multiple objects exist", () => {
    const r = extractFirstJson('{"first": true} {"second": true}');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual((r as { data: unknown }).data, { first: true });
  });

  it("handles nested braces", () => {
    const r = extractFirstJson('pre {"a": {"b": 2}} post');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual((r as { data: unknown }).data, { a: { b: 2 } });
  });

  it("handles JSON with string containing braces", () => {
    const r = extractFirstJson('{"msg": "hello { world }"}');
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual((r as { data: unknown }).data, { msg: "hello { world }" });
  });

  it("returns NO_JSON_OBJECT when no brace", () => {
    const r = extractFirstJson("no json here");
    assert.strictEqual(r.ok, false);
    assert.strictEqual((r as { errorCode: string }).errorCode, "NO_JSON_OBJECT");
  });

  it("returns UNBALANCED_BRACES when closing brace missing", () => {
    const r = extractFirstJson("text {\"a\": 1");
    assert.strictEqual(r.ok, false);
    assert.strictEqual((r as { errorCode: string }).errorCode, "UNBALANCED_BRACES");
  });

  it("returns JSON_PARSE_ERROR for invalid JSON", () => {
    const r = extractFirstJson("text { invalid }");
    assert.strictEqual(r.ok, false);
    assert.strictEqual((r as { errorCode: string }).errorCode, "JSON_PARSE_ERROR");
  });

  it("returns INVALID_INPUT for non-string", () => {
    const r = extractFirstJson(null as unknown as string);
    assert.strictEqual(r.ok, false);
    assert.strictEqual((r as { errorCode: string }).errorCode, "INVALID_INPUT");
  });
});

describe("extractFirstJsonObject", () => {
  it("returns { jsonText, parsed } from plain text with leading commentary", () => {
    const out = extractFirstJsonObject('Here is the result: {"a": 1}');
    assert.deepStrictEqual(out.parsed, { a: 1 });
    assert.strictEqual(out.jsonText, '{"a": 1}');
  });

  it("returns parsed object and jsonText from trailing commentary", () => {
    const out = extractFirstJsonObject('{"x": 42} and that was the answer.');
    assert.deepStrictEqual(out.parsed, { x: 42 });
    assert.ok(out.jsonText.includes('"x"'));
  });

  it("prefers ```json block when present", () => {
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
    const out = extractFirstJsonObject('pre [1, 2, 3] post');
    assert.deepStrictEqual(out.parsed, [1, 2, 3]);
    assert.ok(out.jsonText.startsWith("["));
  });

  it("throws NoJsonFoundError when no JSON found", () => {
    assert.throws(
      () => extractFirstJsonObject("no json here"),
      (e: unknown) => e instanceof NoJsonFoundError && e.code === ERR_NO_JSON_FOUND
    );
  });

  it("throws NoJsonFoundError for empty string", () => {
    assert.throws(
      () => extractFirstJsonObject(""),
      (e: unknown) => e instanceof NoJsonFoundError
    );
  });

  it("throws for non-string input", () => {
    assert.throws(
      () => extractFirstJsonObject(null as unknown as string),
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
