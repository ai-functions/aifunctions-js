# Optimization report: extractTopics

Generated: 2026-03-04T15:21:27.064Z

## Weak mode

### Original

```
Extract up to 5 topics from the text.
JSON ONLY: {"topics": ["Topic 1", "Topic 2", ...]}
No explanation.
```

Words: 18

### Optimized

```
Extract up to 5 topics from the input text. JSON ONLY: {"topics": ["Topic 1", "Topic 2", ...]}. No explanation.
```

Words: 19 (+1)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 18825 |
| Prompt tokens | 111 |
| Completion tokens | 1354 |
| Total tokens | 1465 |

---

## Normal mode

### Original

```
Extract the most important topics from the provided text.
Return a maximum of 5 topics.
Respond in JSON format with a "topics" array of strings.
```

Words: 25

### Optimized

```
Extract the most important topics from the provided text. Return up to 5 topics. Respond in JSON format with a 'topics' array of strings.
```

Words: 24 (-1)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 16543 |
| Prompt tokens | 105 |
| Completion tokens | 954 |
| Total tokens | 1059 |
