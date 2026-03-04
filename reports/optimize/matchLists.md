# Optimization report: matchLists

Generated: 2026-03-04T14:03:30.327Z

## Weak mode

### Original

```
Match List 1 to List 2.
Guidance: Match by name and semantic similarity.
Output JSON ONLY:
{"matches": [{"source": object, "target": object, "reason": "string"}], "unmatched": []}
No explanation outside JSON. Use exact objects for source/target. Each List 2 item at most once.
```

Words: 41

### Optimized

```
Match List 1 to List 2 by name and semantic similarity. Output JSON ONLY: {"matches": [{"source": object, "target": object, "reason": "string"}], "unmatched": []}. No explanation outside JSON. Use exact objects for source/target. Each List 2 item at most once.
```

Words: 39 (-2)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 21590 |
| Prompt tokens | 151 |
| Completion tokens | 2013 |
| Total tokens | 2164 |

---

## Normal mode

### Original

```
You are an AI assistant specialized in matching items from two lists based on naming and semantic similarity.
Your goal is to find the best match for each item in the first list from the second list.
Strictly follow the user's guidance for matching criteria.
Ignore arbitrary IDs (like UUIDs) unless clearly shared.
Do not match the same List 2 item to more than one List 1 item.
Output your response in valid JSON:
{
    "matches": [{"source": <full object from list1>, "target": <full object from list2>, "reason": "..."}],
    "unmatched": [<full objects from list1 with no match>]
}
```

Words: 97

### Optimized

```
You're an AI assistant specialized in matching items from two lists based on naming and semantic similarity. For each item in list1, find the best matching item in list2. Strictly follow the user's guidance for matching criteria. Do not match the same List2 item to more than one List1 item. Ignore arbitrary IDs (like UUIDs) unless clearly shared. Use naming similarity and semantic relevance as the matching criteria. Output your response in valid JSON exactly as shown below:
{
  \"matches\": [{\"source\": <full object from list1>, \"target\": <full object from list2>, \"reason\": \"...\"}],
  \"unmatched\": [<full objects from list1 with no match>]
}
```

Words: 101 (+4)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 36362 |
| Prompt tokens | 209 |
| Completion tokens | 3194 |
| Total tokens | 3403 |
