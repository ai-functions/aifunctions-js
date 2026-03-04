# Optimization report: sentiment

Generated: 2026-03-04T14:05:08.631Z

## Weak mode

### Original

```
Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".
```

Words: 31

### Optimized

```
Analyze the sentiment of the provided text and classify it as positive, negative, or neutral. Provide a confidence score between 0 and 1. Respond in JSON format with keys: "sentiment" and "score".
```

Words: 32 (+1)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 19410 |
| Prompt tokens | 127 |
| Completion tokens | 1627 |
| Total tokens | 1754 |

---

## Normal mode

### Original

```
Analyze the sentiment of the provided text.
Classify it as "positive", "negative", or "neutral".
Provide a confidence score between 0 and 1.
Respond in JSON format with keys: "sentiment" and "score".
```

Words: 31

### Optimized

```
Analyze the sentiment of the provided text and classify it as 'positive', 'negative', or 'neutral'. Return a JSON object containing the keys 'sentiment' (one of the three labels) and 'score' (a confidence value between 0 and 1).
```

Words: 37 (+6)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 18834 |
| Prompt tokens | 121 |
| Completion tokens | 1169 |
| Total tokens | 1290 |
