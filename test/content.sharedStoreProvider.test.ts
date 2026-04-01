/**
 * Tests for store keys and SharedStoreContentProvider via createFunctionContentProvider (mocked fetch).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getStoreKeys,
  createFunctionContentProvider,
  FunctionContentNotFoundError,
  FunctionContentConfigError,
} from "../dist/src/index.js";

describe("storeKeys", () => {
  it("getStoreKeys returns canonical keys for functionId", () => {
    const keys = getStoreKeys("myFunc");
    assert.strictEqual(keys.strong, "functions/myfunc/strong");
    assert.strictEqual(keys.weak, "functions/myfunc/weak");
    assert.strictEqual(keys.ultra, "functions/myfunc/ultra");
    assert.strictEqual(keys.rules, "functions/myfunc/rules");
    assert.strictEqual(keys.metaJson, "functions/myfunc/meta.json");
    assert.strictEqual(keys.testCasesJson, "functions/myfunc/test-cases.json");
  });

  it("normalizes functionId segment (lowercase, spaces to hyphens)", () => {
    const keys = getStoreKeys("My Func");
    assert.strictEqual(keys.strong, "functions/my-func/strong");
  });
});

describe("SharedStoreContentProvider via createFunctionContentProvider", () => {
  it("throws FunctionContentConfigError when baseUrl is missing", () => {
    assert.throws(
      () => createFunctionContentProvider({ mode: "shared-store" }),
      (err: Error) => err instanceof FunctionContentConfigError && err.message.includes("sharedStore")
    );
  });

  it("getFunctionContent returns content when fetch returns at least one key", async () => {
    const baseUrl = "https://store.test";
    let fetchCalls: string[] = [];
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url;
      fetchCalls.push(url);
      // Keys are requested as encodeURIComponent("functions/test/strong") → ...%2Fstrong (no "/strong" substring)
      if (url.includes("%2Fstrong") || url.includes("%2Fweak")) {
        return new Response("You are helpful.", { status: 200 });
      }
      if (url.includes("%2Frules")) {
        return new Response(JSON.stringify([{ rule: "JSON only.", weight: 1 }]), { status: 200 });
      }
      if (url.includes("meta.json")) {
        return new Response(JSON.stringify({ status: "draft" }), { status: 200 });
      }
      if (url.includes("test-cases.json")) {
        return new Response("[]", { status: 200 });
      }
      return new Response("", { status: 404 });
    };
    try {
      const provider = createFunctionContentProvider({
        mode: "shared-store",
        sharedStore: { baseUrl },
      });
      const content = await provider.getFunctionContent({ functionId: "test" });
      assert.strictEqual(content.functionId, "test");
      assert.ok(content.instructions?.strong || content.instructions?.weak);
      assert.strictEqual(content.source.mode, "shared-store");
      assert.strictEqual(content.source.baseUrl, baseUrl);
      assert.ok(fetchCalls.some((u) => u.includes("%2Fstrong") || u.includes("%2Fweak")));
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });

  it("getFunctionContent throws FunctionContentNotFoundError when no keys exist", async () => {
    const baseUrl = "https://store.test";
    const originalFetch = globalThis.fetch;
    (globalThis as { fetch: typeof fetch }).fetch = async () => new Response("", { status: 404 });
    try {
      const provider = createFunctionContentProvider({
        mode: "shared-store",
        sharedStore: { baseUrl },
      });
      await assert.rejects(
        () => provider.getFunctionContent({ functionId: "nonexistent" }),
        (err: Error) =>
          err instanceof FunctionContentNotFoundError && err.functionId === "nonexistent"
      );
    } finally {
      (globalThis as { fetch: typeof fetch }).fetch = originalFetch;
    }
  });
});
