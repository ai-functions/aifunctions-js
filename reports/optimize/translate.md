# Optimization report: translate

Generated: 2026-03-04T15:23:14.070Z

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
Translate the given text into the requested language, preserving tone and context. Respond in JSON with the keys "translatedText" and "detectedSourceLanguage".
```

Words: 21 (-1)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 18241 |
| Prompt tokens | 111 |
| Completion tokens | 1053 |
| Total tokens | 1164 |

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
Translate the given text into the target language, preserving tone and context. Detect the source language and include it in the response. Return a JSON object with the keys \"translatedText\" and \"detectedSourceLanguage\".
```

Words: 32 (+0)

### Optimization details

| Metric | Value |
|--------|-------|
| Duration (ms) | 10264 |
| Prompt tokens | 116 |
| Completion tokens | 800 |
| Total tokens | 916 |
