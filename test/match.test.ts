/**
 * Unit tests for match() with mocked client. No API key required. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { match } from "../dist/functions/index.js";

const usage = { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 };

describe("match", () => {
  it("maps model idx selections to stable IDs, dedupes, and enforces maxResults", async () => {
    const client = {
      ask: async () => ({
        text: JSON.stringify({
          noMatch: false,
          matches: [
            { idx: 2, score: 0.9, reason: "best" },
            { idx: 2, score: 0.8, reason: "dup" },
            { idx: 999, score: 1, reason: "out of range" },
            // keep <= maxResults items so schema passes
          ],
        }),
        usage,
        model: "test-model",
      }),
      testConnection: async () => true,
    };

    const out = await match({
      query: "cve",
      candidates: [
        { id: "a", label: "first" },
        { id: "b", label: "second" },
      ],
      maxResults: 3,
      returnReasons: true,
      client: client as never,
    });

    assert.strictEqual(out.query, "cve");
    assert.strictEqual(out.noMatch, false);
    assert.ok(out.matches.length >= 1 && out.matches.length <= 2);
    assert.deepStrictEqual(out.matches[0].id, "b");
    assert.ok(out.matches[0].score <= 1 && out.matches[0].score >= 0);
    assert.strictEqual(out.matches[0].reason, "best");
  });

  it("supports allowNoMatch + minScore threshold", async () => {
    const client = {
      ask: async () => ({
        text: JSON.stringify({
          noMatch: false,
          matches: [{ idx: 1, score: 0.2, reason: "weak" }],
        }),
        usage,
      }),
      testConnection: async () => true,
    };

    const out = await match({
      query: "something unrelated",
      candidates: [{ id: 1, label: "candidate" }],
      minScore: 0.6,
      allowNoMatch: true,
      client: client as never,
    });

    assert.strictEqual(out.noMatch, true);
    assert.deepStrictEqual(out.matches, []);
  });

  it("omits reasons when returnReasons=false", async () => {
    const client = {
      ask: async () => ({
        text: JSON.stringify({
          noMatch: false,
          matches: [{ idx: 1, score: 0.9 }],
        }),
        usage,
      }),
      testConnection: async () => true,
    };

    const out = await match({
      query: "x",
      candidates: [{ id: "id1", label: "Label 1" }],
      returnReasons: false,
      client: client as never,
    });
    assert.strictEqual(out.noMatch, false);
    assert.strictEqual(out.matches.length, 1);
    assert.strictEqual(out.matches[0].id, "id1");
    assert.ok(!("reason" in out.matches[0]));
  });
});

