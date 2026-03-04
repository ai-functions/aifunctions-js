# Optimization report: sentiment

Generated: 2026-03-04T15:22:55.792Z

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
Analyze the sentiment of the provided text and output a JSON object with keys sentiment and score, where sentiment is one of 'positive', 'negative', or 'neutral', and score is a number between 0 and 1.
```

Words: 35 (+4)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 17871 |
| Prompt tokens | 127 |
| Completion tokens | 1534 |
| Total tokens | 1661 |

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
Determine the sentiment of the provided text. Classify it as 'positive', 'negative', or 'neutral'. Return a JSON object with keys 'sentiment' and 'score', where 'score' is a number in [0,1].
```

Words: 30 (-1)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 13648 |
| Prompt tokens | 121 |
| Completion tokens | 915 |
| Total tokens | 1036 |
