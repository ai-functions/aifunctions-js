/**
 * Unit tests for extractFirstJson. No API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractFirstJson } from "../dist/functions/index.js";

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
