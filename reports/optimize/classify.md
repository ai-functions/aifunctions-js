# Optimization report: classify

Generated: 2026-03-04T14:04:49.218Z

## Weak mode

### Original

```
Classify into: Category A, Category B.
JSON ONLY: {"categories": ["..."]}
```

Words: 10

### Optimized

```
Classify the input into Category A or Category B. Return only a JSON object of the form: {"categories": ["Category A"]} or {"categories": ["Category B"]}.
```

Words: 24 (+14)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 20829 |
| Prompt tokens | 99 |
| Completion tokens | 2038 |
| Total tokens | 2137 |

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
Classify text into one of two categories: Category A or Category B. Select exactly one. Output a JSON object in this format: {"categories": ["<SelectedCategory>"], "confidence": 0-1}.
```

Words: 26 (+10)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 24189 |
| Prompt tokens | 105 |
| Completion tokens | 1231 |
| Total tokens | 1336 |
