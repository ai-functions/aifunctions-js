# Optimization report: extractEntities

Generated: 2026-03-04T14:04:05.073Z

## Weak mode

### Original

```
Extract entities: Person, Organization, Location, Date, Product.
JSON ONLY: {"entities": [{"name": "...", "type": "..."}]}
No chat.
```

Words: 16

### Optimized

```
Extract entities: Person, Organization, Location, Date, Product. JSON ONLY: {"entities": [{"name": "...", "type": "..."}]} No chat.
```

Words: 16 (+0)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 16015 |
| Prompt tokens | 113 |
| Completion tokens | 1090 |
| Total tokens | 1203 |

---

## Normal mode

### Original

```
Extract named entities from the text.
Focus on: Person, Organization, Location, Date, Product.
For each, provide name, type, and brief context.
Respond in JSON: {"entities": [{"name": "...", "type": "...", "context": "..."}]}
```

Words: 31

### Optimized

```
Extract named entities from the input text. Focus on Person, Organization, Location, Date, and Product. For each entity, provide name, type, and a brief context. Respond in JSON exactly as: {"entities": [{"name": "...", "type": "...", "context": "..."}]}
```

Words: 37 (+6)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 12946 |
| Prompt tokens | 129 |
| Completion tokens | 853 |
| Total tokens | 982 |
