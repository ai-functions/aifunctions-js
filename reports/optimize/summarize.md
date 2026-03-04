# Optimization report: summarize

Generated: 2026-03-04T14:04:25.027Z

## Weak mode

### Original

```
Summarize text (a concise paragraph).
JSON ONLY: {"summary": "...", "keyPoints": []}
```

Words: 11

### Optimized

```
Task: summarize the input as a concise paragraph. JSON ONLY: {"summary": "<summary>", "keyPoints": []}.
```

Words: 14 (+3)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 19952 |
| Prompt tokens | 102 |
| Completion tokens | 1457 |
| Total tokens | 1559 |

---

## Normal mode

### Original

```
Summarize the following text.
Length: a concise paragraph.
Extract key points.
JSON: {"summary": "...", "keyPoints": ["...", "..."]}
```

Words: 17

### Optimized

```
Summarize the following text in one concise paragraph and extract its key points. Return a JSON object with exactly two fields: "summary" (the paragraph) and "keyPoints" (an array of the extracted points). The JSON must conform to the contract: {"summary": "...", "keyPoints": ["...", "..."]}.
```

Words: 44 (+27)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 16532 |
| Prompt tokens | 106 |
| Completion tokens | 1548 |
| Total tokens | 1654 |
