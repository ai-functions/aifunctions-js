/**
 * Comprehensive live integration test for all library functions.
 * Requires OPENROUTER_API_KEY in .env for strong mode; weak mode requires node-llama-cpp (skipped if not installed).
 */
import "dotenv/config";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
    matchLists,
    extractTopics,
    extractEntities,
    summarize,
    summarizeStream,
    classify,
    sentiment,
    translate,
    rank,
    cluster
} from "../dist/functions/index.js";

async function canUseLlamaCpp(): Promise<boolean> {
    try {
        await import("node-llama-cpp");
        return true;
    } catch {
        return false;
    }
}

describe("Library Functions (Live Verification)", async () => {
    const hasLlamaCpp = await canUseLlamaCpp();
    const weakIt = hasLlamaCpp ? it : it.skip;

    it("extractTopics (strong)", async () => {
        const result = await extractTopics({
            text: "The James Webb Space Telescope has captured stunning new images of the Pillars of Creation, revealing intricate details of star formation.",
            maxTopics: 2,
            mode: "normal"
        });
        assert.ok(result.topics.length > 0);
        assert.ok(result.topics.some(t => t.toLowerCase().includes("space") || t.toLowerCase().includes("telescope") || t.toLowerCase().includes("star")));
    });

    weakIt("extractTopics (weak)", async () => {
        const result = await extractTopics({
            text: "Climate change affects global weather patterns and sea levels.",
            maxTopics: 2,
            mode: "weak"
        });
        assert.ok(Array.isArray(result.topics));
        assert.ok(result.topics.length >= 0 && result.topics.length <= 2);
    });

    it("extractEntities (strong)", async () => {
        const result = await extractEntities({
            text: "OpenAI was founded by Sam Altman and Elon Musk in San Francisco.",
            mode: "normal"
        });
        const names = result.entities.map(e => e.name);
        assert.ok(names.includes("OpenAI"));
        assert.ok(names.includes("Sam Altman") || names.includes("Elon Musk"));
    });

    weakIt("extractEntities (weak)", async () => {
        const result = await extractEntities({
            text: "Microsoft is headquartered in Redmond.",
            mode: "weak"
        });
        assert.ok(Array.isArray(result.entities));
    });

    it("summarize (strong)", async () => {
        const text = "Artificial intelligence (AI) is intelligence demonstrated by machines, as opposed to natural intelligence displayed by animals including humans. AI research has been defined as the field of study of intelligent agents, which refers to any system that perceives its environment and takes actions that maximize its chance of achieving its goals.";
        const result = await summarize({ text, length: "brief", mode: "normal" });
        assert.ok(result.summary.length > 0);
        assert.ok(result.keyPoints.length > 0);
    });

    weakIt("summarize (weak)", async () => {
        const text = "The company reported strong earnings this quarter.";
        const result = await summarize({ text, length: "brief", mode: "weak" });
        assert.ok(typeof result.summary === "string");
        assert.ok(Array.isArray(result.keyPoints));
    });

    it("classify (strong)", async () => {
        const result = await classify({
            text: "I need to reset my password because I forgot it.",
            categories: ["Technical Support", "Billing", "Sales"],
            mode: "normal"
        });
        assert.ok(result.categories.includes("Technical Support"));
    });

    weakIt("classify (weak)", async () => {
        const result = await classify({
            text: "I want to cancel my subscription.",
            categories: ["Billing", "Technical Support", "Sales"],
            mode: "weak"
        });
        assert.ok(Array.isArray(result.categories));
        assert.ok(result.categories.length >= 1);
    });

    it("sentiment", async () => {
        const result = await sentiment({ text: "I am so happy with this service!" });
        assert.strictEqual(result.sentiment, "positive");
        assert.ok(result.score > 0.5);
    });

    it("translate", async () => {
        const result = await translate({ text: "Hello", targetLanguage: "Spanish" });
        assert.ok(result.translatedText.toLowerCase().includes("hola"));
    });

    it("rank", async () => {
        const items = [
            { id: 1, name: "Pizza" },
            { id: 2, name: "Salad" },
            { id: 3, name: "Burger" }
        ];
        const result = await rank({ items, query: "I want something healthy and green" });
        assert.strictEqual(result.rankedItems[0].item.name.trim(), "Salad");
    });

    it("cluster", async () => {
        const items = [
            { text: "I love apples" },
            { text: "Oranges are great" },
            { text: "Laptops are fast" },
            { text: "My monitors are bright" }
        ];
        const result = await cluster({ items, numClusters: 2 });
        assert.strictEqual(result.clusters.length, 2);
    });

    it("matchLists (strong)", async () => {
        const list1 = [{ id: 1, name: "Apple" }];
        const list2 = [{ item: "Apple", type: "Fruit" }];
        const result = await matchLists({ list1, list2, guidance: "Match by name", mode: "normal" });
        assert.strictEqual(result.matches[0].source.name, "Apple");
        assert.strictEqual(result.matches[0].target.item, "Apple");
    });

    weakIt("matchLists (weak)", async () => {
        const list1 = [{ id: 1, name: "Banana" }];
        const list2 = [{ item: "Banana", type: "Fruit" }];
        const result = await matchLists({ list1, list2, guidance: "Match by name", mode: "weak" });
        assert.ok(Array.isArray(result.matches));
        assert.ok(Array.isArray(result.unmatched));
        assert.ok(result.matches.length >= 1);
        assert.strictEqual(result.matches[0].source.name, "Banana");
    });

    it("summarizeStream yields text, usage, and done", async () => {
        const text = "Machine learning is a subset of artificial intelligence.";
        let fullText = "";
        let usageSeen = false;
        let doneSeen = false;
        for await (const chunk of summarizeStream({ text, length: "brief" })) {
            if (chunk.type === "text") fullText += chunk.text;
            if (chunk.type === "usage") usageSeen = true;
            if (chunk.type === "done") doneSeen = true;
        }
        assert.ok(usageSeen, "should yield usage");
        assert.ok(doneSeen, "should yield done");
        assert.ok(fullText.length > 0, "should yield text");
        const parsed = JSON.parse(fullText) as { summary?: string; keyPoints?: string[] };
        assert.ok(typeof parsed.summary === "string");
        assert.ok(Array.isArray(parsed.keyPoints));
    });

});
