# Optimization report: cluster

Generated: 2026-03-04T15:23:47.508Z

## Weak mode

### Original

```
Group the items into semantic clusters. Provide a descriptive label for each cluster. Respond in JSON with "clusters" array. Maintain full original objects in "items" array.
```

Words: 26

### Optimized

```
Group items into semantic clusters and assign a descriptive label to each cluster. Respond with JSON containing a 'clusters' array (each entry includes a 'label') and an 'items' array with the full original objects unchanged.
```

Words: 35 (+9)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 15613 |
| Prompt tokens | 113 |
| Completion tokens | 1513 |
| Total tokens | 1626 |

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
Group the items into semantic clusters. Identify the natural number of clusters. Provide a descriptive label for each cluster. For each cluster, retain the full original objects in an 'items' array. Respond with JSON containing a 'clusters' array.
```

Words: 38 (-3)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 14089 |
| Prompt tokens | 123 |
| Completion tokens | 955 |
| Total tokens | 1078 |
