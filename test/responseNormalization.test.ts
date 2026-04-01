import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  stripMarkdownFences,
  extractBalancedJsonObject,
  normalizeAndParseJsonObjectResponse,
  NxAiApiError,
} from "../dist/src/index.js";

const think = "think";

describe("responseNormalization", () => {
  it("stripMarkdownFences unwraps a single fenced json body", () => {
    const inner = `{"x":1}`;
    const wrapped = "```json\n" + inner + "\n```";
    assert.strictEqual(stripMarkdownFences(wrapped), inner);
    assert.strictEqual(stripMarkdownFences("```\n" + inner + "\n```"), inner);
  });

  it("extractBalancedJsonObject handles strings and escapes", () => {
    const s = 'prefix {"a":"}"} suffix';
    assert.strictEqual(extractBalancedJsonObject(s), '{"a":"}"}');
  });

  it("runs full pipeline: reasoning, fence, trailing prose", () => {
    const open = "<" + think + ">";
    const close = "</" + think + ">";
    const raw =
      open +
      "hidden" +
      close +
      "\n```json\n" +
      '{"ok":true}' +
      "\n```\n\nThanks!";
    const { text, parsed } = normalizeAndParseJsonObjectResponse(raw, {});
    assert.strictEqual(text, '{"ok":true}');
    assert.deepStrictEqual(parsed, { ok: true });
  });

  it("extracts first object when no full-document fence", () => {
    const raw = "Here: {\"n\":2} and more";
    const { parsed } = normalizeAndParseJsonObjectResponse(raw, {});
    assert.deepStrictEqual(parsed, { n: 2 });
  });

  it("throws RESPONSE_NORMALIZATION_FAILED when no object", () => {
    assert.throws(
      () => normalizeAndParseJsonObjectResponse("no braces", {}),
      (e: unknown) =>
        e instanceof NxAiApiError &&
        e.code === "RESPONSE_NORMALIZATION_FAILED" &&
        typeof (e.details as { snippet?: string })?.snippet === "string"
    );
  });

  it("throws RESPONSE_NORMALIZATION_FAILED when JSON invalid", () => {
    assert.throws(
      () => normalizeAndParseJsonObjectResponse("{broken", {}),
      (e: unknown) => e instanceof NxAiApiError && e.code === "RESPONSE_NORMALIZATION_FAILED"
    );
  });

  it("respects responseNormalization toggles", () => {
    const clean = '{"z":3}';
    const { parsed } = normalizeAndParseJsonObjectResponse(clean, {
      stripReasoningBlocks: false,
      stripMarkdownFences: false,
      extractBalancedJsonObject: false,
    });
    assert.deepStrictEqual(parsed, { z: 3 });
  });
});
