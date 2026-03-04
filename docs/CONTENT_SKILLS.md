# Content-based skills catalog

Skills whose **instructions and optional rules** are loaded from the content store (e.g. nx-content with a Git or local backend) run via `runWithContent(skillName, request, { resolver })`. The resolver loads instructions by skill key and mode (weak / normal / strong).

## Catalog

| Skill key / name | Purpose | Orchestration-only? |
|------------------|---------|---------------------|
| **judge** | Judge model output (e.g. against criteria or rules). (Alias: `ai.judge.v1` still accepted.) | No |
| **compare** | Compare two items or outputs (e.g. model A vs model B). | Yes — orchestrates other calls; no single LLM call with its own instruction pack. |
| **fixInstructions** | Revise or fix instruction text. | No |
| **generateRule** | Generate a rule (e.g. judge rule) from examples or description. | No |
| **race-models** | Run multiple models and aggregate or compare. | Yes |
| **generate-instructions** | Generate instruction text for a skill. | No |
| **generate-judge-rules** | Generate judge rules from examples. | No |
| **aggregate-judge-feedback** | Aggregate feedback from multiple judge calls. | Yes |
| **normalize-judge-rules** | Normalize or merge judge rules. | No |
| **optimize-instructions** | Optimize instruction text (e.g. for brevity or clarity). | No |

Instructions and rules are resolved with `resolveSkillInstructions(resolver, skillKey, mode)` and `resolveSkillRules(resolver, skillKey)`. Content keys follow the convention in [skillsResolver](../src/content/skillsResolver.ts) (e.g. `skills/<skillKey>/<mode>` for instructions, `skills/<skillKey>/rules` for rules).
