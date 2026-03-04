# INPUT_MD convention for LLM-backed skills

All LLM-backed functions in light-skills (and consumers like the records-mapper) should follow a single pattern for what the model sees as input and what it must produce as output.

## Rule

1. **Only input the model sees** — A single Markdown document called **INPUT_MD** (built from a template with placeholders). No free-form concatenation of instruction + text; use a consistent template.
2. **Output contract** — The model output must match the function’s **output contract** (e.g. “single JSON object only”, or a specific schema). No markdown fences or commentary unless the contract allows it.

## Template shape

Use a standard structure so every skill looks the same to the orchestrator and to future tooling (e.g. Skill Spec loaders):

- **`# Skill`** — Skill name (e.g. `# extractTopics`).
- **`## Instruction`** — What the model must do (placeholder: `{{instruction}}`).
- **`## Output Contract`** — What the response must look like (placeholder: `{{outputContract}}`).
- **`## Input Data`** — The actual input (placeholder: `{{inputData}}` — can be Markdown or a JSON block).

Example:

```markdown
# extractTopics

## Instruction
Extract the most important topics from the provided text. Return a maximum of {{maxTopics}} topics.

## Output Contract
A single JSON object with key "topics", an array of strings.

## Input Data
{{inputData}}
```

## Placeholders

- Use `{{var}}` for simple values (e.g. `{{maxTopics}}`, `{{instruction}}`).
- Use `{{inputData}}` for the main payload (often the request body as JSON or Markdown).
- For collection-mapping style skills, use e.g. `{{left.fieldsMdList}}`, `{{right.fieldsMdList}}` (document how the orchestrator builds these, e.g. newline-separated field names or "name: type" lines).

The orchestrator (callAI, the router, or runWithContent) is responsible for rendering these: load the template, substitute variables, then send the result as the user message (or the only message after the system prompt).

## How runWithContent uses INPUT_MD

[functions/router.ts](../functions/router.ts) builds a minimal INPUT_MD today:

- `# ${skillName}`
- `## Request` + a JSON code block of the request

So the “Input Data” is the request object. Instructions come from the content store (per skill key and mode). Future skills can adopt the full template (Instruction, Output Contract, Input Data) and store templates in content or in Skill Spec files.

## Skill Spec files (optional)

To keep the repo consistent, skills can store instructions as **Skill Spec** files, e.g.:

- `skills/ai.ask/normal.md` (system + user template, or split)
- `skills/ai.ask/weak.md`

Use the same placeholder convention and document how the loader renders them. callAI / the router loads the appropriate pack by mode (weak → weak.md, normal/strong → normal.md or strong.md) and substitutes variables to produce INPUT_MD.
