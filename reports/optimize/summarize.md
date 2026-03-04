# Optimization report: summarize

Generated: 2026-03-04T15:22:16.830Z

## Weak mode

### Original

```
Summarize text (a concise paragraph).
JSON ONLY: {"summary": "...", "keyPoints": []}
```

Words: 11

### Optimized

```
Summarize the input text into a single concise paragraph. Return a JSON object with exactly two fields: 'summary' (the paragraph) and 'keyPoints' (an array of the main points). Do not include any other content or fields.
```

Words: 36 (+25)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 13107 |
| Prompt tokens | 102 |
| Completion tokens | 1157 |
| Total tokens | 1259 |

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
Summarize the following text in a concise paragraph and extract its key points. Return a JSON object with the keys 'summary' and 'keyPoints', where 'summary' is the concise paragraph and 'keyPoints' is an array of the main points.
```

Words: 38 (+21)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 9375 |
| Prompt tokens | 106 |
| Completion tokens | 1154 |
| Total tokens | 1260 |
