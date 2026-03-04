# Optimization report: cluster

Generated: 2026-03-04T14:06:09.984Z

## Weak mode

### Original

```
Group the items into semantic clusters. Provide a descriptive label for each cluster. Respond in JSON with "clusters" array. Maintain full original objects in "items" array.
```

Words: 26

### Optimized

```
Group items into semantic clusters and label each cluster with a descriptive name. Return a JSON object with a 'clusters' array and an 'items' array containing the full original objects.
```

Words: 30 (+4)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 18501 |
| Prompt tokens | 113 |
| Completion tokens | 1041 |
| Total tokens | 1154 |

---

## Normal mode

### Original

```
Group the following items into semantic clusters.
Identify the most natural number of clusters.
Provide a descriptive label for each cluster.
Maintain the full original objects in the "items" array for each cluster.
Respond in JSON format with a "clusters" array.
```

Words: 41

### Optimized

```
Group the provided items into semantic clusters. Determine the natural (optimal) number of clusters. For each cluster, provide a descriptive label and an items array containing the original objects (unchanged). Respond with a JSON object that has a top-level clusters array; each cluster should include a label and an items array of the original objects.
```

Words: 55 (+14)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 17569 |
| Prompt tokens | 123 |
| Completion tokens | 1564 |
| Total tokens | 1687 |
