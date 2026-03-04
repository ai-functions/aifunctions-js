# Optimization report: translate

Generated: 2026-03-04T14:05:29.838Z

## Weak mode

### Original

```
Translate the following text into the requested language.
Maintain the original tone and context.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".
```

Words: 22

### Optimized

```
Translate the following text into the requested language, preserving tone and context. Respond in JSON with fields "translatedText" and "detectedSourceLanguage".
```

Words: 20 (-2)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 21204 |
| Prompt tokens | 111 |
| Completion tokens | 1137 |
| Total tokens | 1248 |

---

## Normal mode

### Original

```
Translate the following text into the requested language.
Maintain the original tone and context.
Detect the source language and include it in your response.
Respond in JSON format with "translatedText" and "detectedSourceLanguage".
```

Words: 32

### Optimized

```
Translate the following text into the requested language. Maintain the original tone and context. Detect the source language and include it in your response. Respond in JSON format with 'translatedText' and 'detectedSourceLanguage'.
```

Words: 32 (+0)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 15488 |
| Prompt tokens | 116 |
| Completion tokens | 876 |
| Total tokens | 992 |
