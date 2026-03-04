# Optimization report: rank

Generated: 2026-03-04T15:23:31.890Z

## Weak mode

### Original

```
Rank the items based on relevance to the query. Provide a score (0-1) and brief reason per item. Respond in JSON with "rankedItems" array. Maintain full original objects in "item" field.
```

Words: 31

### Optimized

```
Rank items by relevance to the query. For each item, provide a score (0-1) and a brief reason. Return a JSON object with a 'rankedItems' array; each element should include 'item' (full original object), 'score' (0-1), and 'reason'.
```

Words: 38 (+7)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 17816 |
| Prompt tokens | 124 |
| Completion tokens | 1280 |
| Total tokens | 1404 |

---

## Normal mode

### Original

```
Rank the following items based on their relevance to the query.
For each item, provide a relevance score between 0 and 1 and a brief reason.
Respond in JSON format with a "rankedItems" array.
Maintain the full original objects in the "item" field.
```

Words: 43

### Optimized

```
Rank the given items by relevance to the query. For each item, provide a relevance score between 0 and 1 and a brief justification. Return JSON with a 'rankedItems' array. Each element's 'item' field must contain the full original object.
```

Words: 40 (-3)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 13067 |
| Prompt tokens | 129 |
| Completion tokens | 778 |
| Total tokens | 907 |
