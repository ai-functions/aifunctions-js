/**
 * Tests for createFunctionContentProvider and getDefaultContentProvider.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createFunctionContentProvider,
  getDefaultContentProvider,
  FunctionContentConfigError,
} from "../dist/src/index.js";

describe("createFunctionContentProvider", () => {
  it("returns InlineContentProvider when mode is inline", () => {
    const provider = createFunctionContentProvider({
      mode: "inline",
      inline: { functions: [{ functionId: "test", instructions: { strong: "Do it." } }] },
    });
    assert.ok(provider);
    assert.strictEqual(typeof provider.getFunctionContent, "function");
  });

  it("returns SharedStoreContentProvider when mode is shared-store", () => {
    const provider = createFunctionContentProvider({
      mode: "shared-store",
      sharedStore: { baseUrl: "https://store.example.com" },
    });
    assert.ok(provider);
    assert.strictEqual(typeof provider.getFunctionContent, "function");
  });

  it("throws FunctionContentConfigError when mode is shared-store but sharedStore missing", () => {
    assert.throws(
      () => createFunctionContentProvider({ mode: "shared-store" }),
      (err: Error) => {
        return err instanceof FunctionContentConfigError && err.message.includes("sharedStore");
      }
    );
  });

  it("throws FunctionContentConfigError when mode is inline but inline.functions missing", () => {
    assert.throws(
      () => createFunctionContentProvider({ mode: "inline" }),
      (err: Error) => {
        return err instanceof FunctionContentConfigError && err.message.includes("inline");
      }
    );
  });
});

describe("getDefaultContentProvider", () => {
  it("returns a provider with getFunctionContent and listFunctions", () => {
    const provider = getDefaultContentProvider();
    assert.ok(provider);
    assert.strictEqual(typeof provider.getFunctionContent, "function");
    assert.strictEqual(typeof provider.listFunctions, "function");
  });

  it("returns the same instance on multiple calls", () => {
    const a = getDefaultContentProvider();
    const b = getDefaultContentProvider();
    assert.strictEqual(a, b);
  });
});
