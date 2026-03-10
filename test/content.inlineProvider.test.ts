/**
 * Tests for InlineContentProvider: resolution, missing function, normalization.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFunctionContentProvider, FunctionContentNotFoundError } from "../dist/src/index.js";

describe("InlineContentProvider", () => {
  it("getFunctionContent returns normalized ResolvedFunctionContent", async () => {
    const provider = createFunctionContentProvider({
      mode: "inline",
      inline: {
        functions: [
          {
            functionId: "myFunc",
            instructions: { strong: "Be helpful.", weak: "Minimal." },
            rules: [{ rule: "Output JSON.", weight: 1 }],
            meta: { status: "draft" },
            testCases: [{ id: "1", inputMd: "hi" }],
          },
        ],
      },
    });
    const content = await provider.getFunctionContent({ functionId: "myFunc" });
    assert.strictEqual(content.functionId, "myFunc");
    assert.strictEqual(content.instructions?.strong, "Be helpful.");
    assert.strictEqual(content.instructions?.weak, "Minimal.");
    assert.deepStrictEqual(content.rules, [{ rule: "Output JSON.", weight: 1 }]);
    assert.deepStrictEqual(content.meta, { status: "draft" });
    assert.strictEqual(Array.isArray(content.testCases) && content.testCases.length, 1);
    assert.strictEqual(content.source.mode, "inline");
    assert.strictEqual(content.source.storeId, undefined);
  });

  it("getFunctionContent throws FunctionContentNotFoundError for missing function", async () => {
    const provider = createFunctionContentProvider({
      mode: "inline",
      inline: { functions: [{ functionId: "only", instructions: {} }] },
    });
    await assert.rejects(
      () => provider.getFunctionContent({ functionId: "missing" }),
      (err: Error) => err instanceof FunctionContentNotFoundError && err.functionId === "missing"
    );
  });

  it("hasFunction returns true for defined function, false otherwise", async () => {
    const provider = createFunctionContentProvider({
      mode: "inline",
      inline: { functions: [{ functionId: "a", instructions: {} }] },
    });
    assert.strictEqual(await provider.hasFunction?.({ functionId: "a" }), true);
    assert.strictEqual(await provider.hasFunction?.({ functionId: "b" }), false);
  });

  it("listFunctions returns all function ids", async () => {
    const provider = createFunctionContentProvider({
      mode: "inline",
      inline: {
        functions: [
          { functionId: "one", instructions: {} },
          { functionId: "two", instructions: {} },
        ],
      },
    });
    const list = await provider.listFunctions?.();
    assert.ok(Array.isArray(list));
    assert.ok(list!.includes("one"));
    assert.ok(list!.includes("two"));
    assert.strictEqual(list!.length, 2);
  });

  it("normalizes missing instructions to empty partial", async () => {
    const provider = createFunctionContentProvider({
      mode: "inline",
      inline: { functions: [{ functionId: "noInstr" }] },
    });
    const content = await provider.getFunctionContent({ functionId: "noInstr" });
    assert.strictEqual(content.functionId, "noInstr");
    assert.ok(typeof content.instructions === "object");
    assert.strictEqual(content.source.mode, "inline");
  });
});
