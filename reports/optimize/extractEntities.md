# Optimization report: extractEntities

Generated: 2026-03-04T15:22:03.718Z

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
Skill: extractEntities. Mode: weak. Extract entities of types Person, Organization, Location, Date, Product from the input text. Output JSON only: {"entities": [{"name": "...", "type": "..."}]} No chat.
```

Words: 27 (+11)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 10508 |
| Prompt tokens | 113 |
| Completion tokens | 1189 |
| Total tokens | 1302 |

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
Extract named entities from the input text. Target entity types: Person, Organization, Location, Date, Product. For each entity, include the name, type, and a brief context. Return a JSON object with the exact shape: {"entities": [{"name": "...", "type": "...", "context": "..."}]}.
```

Words: 41 (+10)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 11205 |
| Prompt tokens | 129 |
| Completion tokens | 892 |
| Total tokens | 1021 |
