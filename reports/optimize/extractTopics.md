# Optimization report: extractTopics

Generated: 2026-03-04T14:03:49.057Z

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
Extract up to 5 topics from the text. Return exactly the JSON object: {"topics": ["Topic 1", "Topic 2", ...]}. Do not provide explanations.
```

Words: 23 (+5)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 17342 |
| Prompt tokens | 111 |
| Completion tokens | 1082 |
| Total tokens | 1193 |

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
Identify up to 5 of the most important topics in the input text. Return a JSON object with a single field 'topics', whose value is an array of strings.
```

Words: 29 (+4)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 18721 |
| Prompt tokens | 105 |
| Completion tokens | 1111 |
| Total tokens | 1216 |
