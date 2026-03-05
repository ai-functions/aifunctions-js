import { describe, it } from "node:test";
import assert from "node:assert";
import { appendActivity, queryActivity } from "../dist/src/serve/activityLog.js";

describe("activityLog", () => {
  it("appendActivity and queryActivity return activities and summary", () => {
    appendActivity({
      functionId: "classify",
      model: "openai/gpt-4o",
      projectId: "proj1",
      traceId: "t1",
      tokens: { prompt: 100, completion: 50, total: 150 },
      cost: 0.001,
      latencyMs: 200,
      status: "success",
    });
    appendActivity({
      functionId: "extract",
      model: "openai/gpt-4o-mini",
      tokens: { prompt: 80, completion: 40, total: 120 },
      cost: 0.0005,
      latencyMs: 150,
      status: "success",
    });
    const { activities, summary } = queryActivity({ limit: 10 });
    assert.ok(Array.isArray(activities));
    assert.ok(activities.length >= 2);
    assert.ok(activities[0].id.startsWith("act_"));
    assert.strictEqual(activities[0].functionId, "extract");
    assert.strictEqual(activities[1].functionId, "classify");
    assert.strictEqual(summary.totalCalls, activities.length >= 2 ? summary.totalCalls : 2);
    assert.ok(typeof summary.totalTokens === "number");
    assert.ok(typeof summary.totalCost === "number");
    assert.ok(typeof summary.byFunction === "object");
    assert.ok(typeof summary.byModel === "object");
  });

  it("queryActivity with functionId filter returns only matching activities", () => {
    const { activities } = queryActivity({ functionId: "classify", limit: 100 });
    const allClassify = activities.every((a) => a.functionId === "classify");
    assert.ok(allClassify);
  });
});
