# Optimization report: rank

Generated: 2026-03-04T14:05:51.482Z

## Weak mode

### Original

```
Rank the items based on relevance to the query. Provide a score (0-1) and brief reason per item. Respond in JSON with "rankedItems" array. Maintain full original objects in "item" field.
```

Words: 31

### Optimized

```
Rank items by relevance to the query. For each item, provide a score in [0,1] and a brief reason. Return JSON with a rankedItems array. Each element must include the original object in the item field, along with its score and reason.
```

Words: 42 (+11)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 19769 |
| Prompt tokens | 124 |
| Completion tokens | 1534 |
| Total tokens | 1658 |

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
Rank the provided items by relevance to the query. For each item, provide a score between 0 and 1 and a brief reason. Respond with a JSON object containing a single field rankedItems, which is an array. Each element must preserve the original item in the item field and include a score (0-1) and a reason (concise).
```

Words: 57 (+14)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 21634 |
| Prompt tokens | 129 |
| Completion tokens | 2588 |
| Total tokens | 2717 |
