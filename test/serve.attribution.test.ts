/**
 * Unit tests for extractAttribution. Run after build.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractAttribution } from "../dist/src/index.js";

describe("extractAttribution", () => {
  it("returns functionId and generates traceId when body is undefined", () => {
    const ctx = extractAttribution(undefined, "extract.requirements");
    assert.strictEqual(ctx.functionId, "extract.requirements");
    assert.strictEqual(typeof ctx.traceId, "string");
    assert.match(ctx.traceId!, /^[0-9a-f-]{36}$/i);
    assert.strictEqual(ctx.projectId, undefined);
    assert.strictEqual(ctx.tags, undefined);
  });

  it("returns functionId and generates traceId when body is not an object", () => {
    const ctx = extractAttribution("string body", "optimize.judge");
    assert.strictEqual(ctx.functionId, "optimize.judge");
    assert.strictEqual(typeof ctx.traceId, "string");
    assert.match(ctx.traceId!, /^[0-9a-f-]{36}$/i);
  });

  it("reads projectId, traceId, and tags from body", () => {
    const body = {
      projectId: "cognni-prod",
      traceId: "req-983741",
      tags: { workflow: "classification", environment: "production" },
    };
    const ctx = extractAttribution(body, "extract.requirements");
    assert.strictEqual(ctx.functionId, "extract.requirements");
    assert.strictEqual(ctx.projectId, "cognni-prod");
    assert.strictEqual(ctx.traceId, "req-983741");
    assert.deepStrictEqual(ctx.tags, { workflow: "classification", environment: "production" });
  });

  it("trims projectId and traceId", () => {
    const ctx = extractAttribution(
      { projectId: "  my-project  ", traceId: "  trace-1  " },
      "skill.summarize"
    );
    assert.strictEqual(ctx.projectId, "my-project");
    assert.strictEqual(ctx.traceId, "trace-1");
  });

  it("generates traceId when body has no traceId", () => {
    const body = { projectId: "demo" };
    const ctx = extractAttribution(body, "plan.create_step_list");
    assert.strictEqual(ctx.functionId, "plan.create_step_list");
    assert.strictEqual(ctx.projectId, "demo");
    assert.strictEqual(typeof ctx.traceId, "string");
    assert.match(ctx.traceId!, /^[0-9a-f-]{36}$/i);
  });

  it("ignores non-string tags values", () => {
    const body = {
      tags: { a: "ok", b: 123, c: null },
    };
    const ctx = extractAttribution(body, "extract.requirements");
    assert.strictEqual(ctx.functionId, "extract.requirements");
    assert.strictEqual(ctx.tags, undefined);
  });

  it("accepts tags when all values are strings", () => {
    const body = {
      tags: { env: "prod", team: "security" },
    };
    const ctx = extractAttribution(body, "extract.requirements");
    assert.deepStrictEqual(ctx.tags, { env: "prod", team: "security" });
  });

  it("ignores empty projectId", () => {
    const ctx = extractAttribution({ projectId: "   " }, "skill.run");
    assert.strictEqual(ctx.projectId, undefined);
  });
});
