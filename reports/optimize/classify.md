# Optimization report: classify

Generated: 2026-03-04T15:22:37.917Z

## Weak mode

### Original

```
Classify into: Category A, Category B.
JSON ONLY: {"categories": ["..."]}
```

Words: 10

### Optimized

```
Classify input as either Category A or Category B. Respond only with JSON: {"categories": ["SelectedCategory"]}.
```

Words: 15 (+5)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 15267 |
| Prompt tokens | 99 |
| Completion tokens | 1298 |
| Total tokens | 1397 |

---

## Normal mode

### Original

```
Classify text into categories: Category A, Category B.
Select exactly one.
JSON: {"categories": ["..."], "confidence": 0-1}
```

Words: 16

### Optimized

```
Classify the input text into exactly one of: Category A or Category B. Return JSON: {"categories": ["<selected category>"], "confidence": <0-1>}.
```

Words: 20 (+4)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 21083 |
| Prompt tokens | 105 |
| Completion tokens | 1255 |
| Total tokens | 1360 |
