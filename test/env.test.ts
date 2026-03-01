import { test } from "node:test";
import assert from "node:assert/strict";
import { getLlamaCppEnv, getTransformersJsEnv } from "../src/env.js";

test("getLlamaCppEnv reads environment variables", () => {
    process.env.LLAMA_CPP_MODEL_PATH = "./test.gguf";
    process.env.LLAMA_CPP_THREADS = "8";
    process.env.LLAMA_CPP_CONTEXT_SIZE = "8192";

    const env = getLlamaCppEnv();
    assert.strictEqual(env.modelPath, "./test.gguf");
    assert.strictEqual(env.threads, 8);
    assert.strictEqual(env.contextSize, 8192);

    delete process.env.LLAMA_CPP_MODEL_PATH;
    delete process.env.LLAMA_CPP_THREADS;
    delete process.env.LLAMA_CPP_CONTEXT_SIZE;
});

test("getTransformersJsEnv reads environment variables", () => {
    process.env.TRANSFORMERS_JS_MODEL_ID = "Xenova/gpt2";
    process.env.TRANSFORMERS_JS_CACHE_DIR = "./cache";

    const env = getTransformersJsEnv();
    assert.strictEqual(env.modelId, "Xenova/gpt2");
    assert.strictEqual(env.cacheDir, "./cache");

    delete process.env.TRANSFORMERS_JS_MODEL_ID;
    delete process.env.TRANSFORMERS_JS_CACHE_DIR;
});
