Below is a **set of small, atomic LLM skills**—each skill does **exactly one thing**, and each includes **“strong” + “weak”** instructions in the same style as your `matchLists` example.

I’m giving you **20 atomic skills** in **one TypeScript file** (easy to split later). Every skill:

* takes `guidance`, `mode`, `client`, `model`, `additionalInstructions`
* outputs **JSON ONLY**
* has a **strict schema** per skill

```ts
import { callAI } from "../callAI.js";
import type { Client } from "../../src/index.js";

/** Shared */
type Mode = "weak" | "strong";

function withAdditional(additionalInstructions?: string) {
  return additionalInstructions ? `\nAdditional Instructions: ${additionalInstructions}\n` : "\n";
}

/* ============================================================
 * 1) WRITING ATOM: Generate titles ONLY
 * ============================================================ */
export interface GenerateTitlesParams {
  text: string;
  guidance: string; // e.g. "B2B SaaS, punchy, no hype"
  count?: number;   // default 5
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface GenerateTitlesResult {
  titles: string[];
}
export async function generateTitles(params: GenerateTitlesParams): Promise<GenerateTitlesResult> {
  const { text, guidance, count = 5, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that generates ONLY titles.
Task: produce exactly ${count} candidate titles for the provided text.
Follow the user's guidance strictly (tone, audience, style).
Rules:
- Titles must be unique (no near-duplicates).
- No extra commentary.
- Do NOT include quotes around titles unless the user requests.
- Output valid JSON ONLY with this exact schema:
{"titles":["string",...]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Generate ${count} titles.
Guidance: ${guidance}
Return JSON ONLY: {"titles":["..."]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<GenerateTitlesResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 2) WRITING ATOM: Create outline ONLY
 * ============================================================ */
export interface GenerateOutlineParams {
  topicOrText: string;
  guidance: string; // e.g. "PRD section outline, 5 sections, include risks"
  maxSections?: number; // default 6
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface GenerateOutlineResult {
  outline: Array<{ title: string; bullets: string[] }>;
}
export async function generateOutline(params: GenerateOutlineParams): Promise<GenerateOutlineResult> {
  const { topicOrText, guidance, maxSections = 6, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that generates ONLY an outline.
Task: produce an outline with up to ${maxSections} sections.
Each section has:
- "title": short
- "bullets": 2-6 bullets, action/point phrasing
Rules:
- Follow the guidance strictly.
- No prose paragraphs. Only outline.
- Output valid JSON ONLY:
{"outline":[{"title":"...","bullets":["..."]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Create outline (max ${maxSections} sections). Guidance: ${guidance}
JSON ONLY: {"outline":[{"title":"...","bullets":["..."]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
TopicOrText: ${topicOrText}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<GenerateOutlineResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 3) WRITING ATOM: Expand outline into draft ONLY
 * ============================================================ */
export interface DraftFromOutlineParams {
  outline: Array<{ title: string; bullets: string[] }>;
  context?: string;
  guidance: string; // e.g. "concise, executive tone, max 350 words"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface DraftFromOutlineResult {
  draft: string;
}
export async function draftFromOutline(params: DraftFromOutlineParams): Promise<DraftFromOutlineResult> {
  const { outline, context = "", guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that expands an outline into a draft ONLY.
Task:
- Use the provided outline structure as headings (or section separators).
- Expand each section into short paragraphs.
Rules:
- Follow guidance strictly (tone/length/style).
- Use only the provided outline + context. Do NOT invent facts.
- Output valid JSON ONLY:
{"draft":"string"}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Expand outline into draft. Guidance: ${guidance}
Return JSON ONLY: {"draft":"..."}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Outline: ${JSON.stringify(outline)}
Context: ${context}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<DraftFromOutlineResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 4) WRITING ATOM: Rewrite tone ONLY
 * ============================================================ */
export interface RewriteToneParams {
  text: string;
  targetTone: string; // e.g. "more direct", "friendly but firm"
  guidance: string;   // extra rules
  preserveTerms?: string[]; // must keep exact
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface RewriteToneResult {
  rewritten: string;
}
export async function rewriteTone(params: RewriteToneParams): Promise<RewriteToneResult> {
  const { text, targetTone, guidance, preserveTerms = [], mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that rewrites text to a target tone ONLY.
Task:
- Rewrite the given text to match the target tone.
Rules:
- Preserve meaning. Do NOT add new facts.
- Preserve these exact terms verbatim if present: ${JSON.stringify(preserveTerms)}
- Output valid JSON ONLY:
{"rewritten":"string"}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Rewrite tone to: ${targetTone}. Guidance: ${guidance}
JSON ONLY: {"rewritten":"..."}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
TargetTone: ${targetTone}
Guidance: ${guidance}
PreserveTerms: ${JSON.stringify(preserveTerms)}
  `.trim();

  const result = await callAI<RewriteToneResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 5) WRITING ATOM: Shorten text ONLY
 * ============================================================ */
export interface ShortenTextParams {
  text: string;
  guidance: string; // e.g. "keep all key details, remove fluff"
  maxWords: number;
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ShortenTextResult {
  shortened: string;
}
export async function shortenText(params: ShortenTextParams): Promise<ShortenTextResult> {
  const { text, guidance, maxWords, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that shortens text ONLY.
Task:
- Reduce the text to <= ${maxWords} words.
Rules:
- Preserve meaning and critical details.
- Remove redundancy and filler first.
- Do NOT add new facts.
- Output valid JSON ONLY:
{"shortened":"string"}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Shorten to max ${maxWords} words. Guidance: ${guidance}
JSON ONLY: {"shortened":"..."}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
MaxWords: ${maxWords}
  `.trim();

  const result = await callAI<ShortenTextResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 6) ANSWERING ATOM: Answer question ONLY (no planning, no extras)
 * ============================================================ */
export interface AnswerQuestionParams {
  question: string;
  context?: string;
  guidance: string; // e.g. "answer in bullets", "be strict"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface AnswerQuestionResult {
  answer: string;
  needsClarification: string[];
}
export async function answerQuestion(params: AnswerQuestionParams): Promise<AnswerQuestionResult> {
  const { question, context = "", guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that answers a question ONLY.
Task:
- Provide the best possible answer using the provided context.
Rules:
- If the context is insufficient, still answer best-effort, but list missing info in "needsClarification".
- Do NOT invent facts.
- Output valid JSON ONLY:
{"answer":"string","needsClarification":["string",...]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Answer the question. Guidance: ${guidance}
JSON ONLY: {"answer":"...","needsClarification":[]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Question: ${question}
Context: ${context}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<AnswerQuestionResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 7) ANSWERING ATOM: Generate clarifying questions ONLY
 * ============================================================ */
export interface GenerateClarifyingQuestionsParams {
  goal: string;            // what we are trying to achieve
  knownInfo?: string;      // what we already know
  guidance: string;        // e.g. "keep to 5 questions max"
  maxQuestions?: number;   // default 7
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface GenerateClarifyingQuestionsResult {
  questions: Array<{ q: string; why: string }>;
}
export async function generateClarifyingQuestions(
  params: GenerateClarifyingQuestionsParams
): Promise<GenerateClarifyingQuestionsResult> {
  const { goal, knownInfo = "", guidance, maxQuestions = 7, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that generates clarifying questions ONLY.
Task:
- Produce up to ${maxQuestions} questions that, if answered, would unblock the goal.
Rules:
- Questions must be specific and actionable.
- Include a short "why" for each question.
- Output valid JSON ONLY:
{"questions":[{"q":"string","why":"string"}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Generate up to ${maxQuestions} clarifying questions. Guidance: ${guidance}
JSON ONLY: {"questions":[{"q":"...","why":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Goal: ${goal}
KnownInfo: ${knownInfo}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<GenerateClarifyingQuestionsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 8) EXTRACTION ATOM: Extract entities ONLY
 * ============================================================ */
export interface ExtractEntitiesParams {
  text: string;
  guidance: string; // e.g. "focus on organizations + products"
  entityTypes?: string[]; // optional filter hint
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ExtractEntitiesResult {
  entities: Array<{ id: string; type: string; name: string; evidence: string }>;
}
export async function extractEntities(params: ExtractEntitiesParams): Promise<ExtractEntitiesResult> {
  const { text, guidance, entityTypes = [], mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that extracts entities ONLY.
Task:
- Identify entities mentioned in the text.
- For each entity provide:
  - id: "e1","e2",...
  - type: a short category label
  - name: exact string from the text
  - evidence: a short snippet from the text (<= 25 words) showing the entity
Rules:
- Do NOT invent entities not present in the text.
- Prefer exact surface forms as they appear.
- If entityTypes is provided, prioritize those types: ${JSON.stringify(entityTypes)}
- Output valid JSON ONLY:
{"entities":[{"id":"e1","type":"...","name":"...","evidence":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract entities. Guidance: ${guidance}
JSON ONLY: {"entities":[{"id":"e1","type":"...","name":"...","evidence":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
EntityTypesHint: ${JSON.stringify(entityTypes)}
  `.trim();

  const result = await callAI<ExtractEntitiesResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 9) EXTRACTION ATOM: Extract relations ONLY
 * ============================================================ */
export interface ExtractRelationsParams {
  text: string;
  entities: Array<{ id: string; name: string }>;
  guidance: string; // e.g. "only employment/ownership relations"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ExtractRelationsResult {
  relations: Array<{ fromId: string; toId: string; type: string; evidence: string }>;
}
export async function extractRelations(params: ExtractRelationsParams): Promise<ExtractRelationsResult> {
  const { text, entities, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that extracts relations ONLY.
Task:
- Use the provided entities list (ids + names).
- Find relations explicitly supported by the text between those entities.
Rules:
- Only produce relations that have clear evidence in the text.
- "fromId" and "toId" must reference provided entity ids.
- evidence must be a short snippet (<= 25 words).
- Output valid JSON ONLY:
{"relations":[{"fromId":"e1","toId":"e2","type":"...","evidence":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract relations among provided entities. Guidance: ${guidance}
JSON ONLY: {"relations":[{"fromId":"e1","toId":"e2","type":"...","evidence":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Entities: ${JSON.stringify(entities)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractRelationsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 10) EXTRACTION ATOM: Extract claims ONLY
 * ============================================================ */
export interface ExtractClaimsParams {
  text: string;
  guidance: string; // e.g. "extract factual claims only, not opinions"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ExtractClaimsResult {
  claims: Array<{ claim: string; evidence: string; claimType: "fact" | "opinion" | "assumption" }>;
}
export async function extractClaims(params: ExtractClaimsParams): Promise<ExtractClaimsResult> {
  const { text, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that extracts claims ONLY.
Task:
- Identify key claims in the text.
- For each claim:
  - claim: normalized statement
  - evidence: short snippet (<= 25 words)
  - claimType: "fact" | "opinion" | "assumption"
Rules:
- Do NOT invent claims not present in the text.
- Keep claims atomic (one idea per claim).
- Output valid JSON ONLY:
{"claims":[{"claim":"...","evidence":"...","claimType":"fact"}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract claims. Guidance: ${guidance}
JSON ONLY: {"claims":[{"claim":"...","evidence":"...","claimType":"fact"}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractClaimsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 11) QUESTIONS ATOM: Extract explicit questions ONLY
 * ============================================================ */
export interface ExtractExplicitQuestionsParams {
  text: string;
  guidance: string; // e.g. "only questions that appear as '?', keep original phrasing"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ExtractExplicitQuestionsResult {
  questions: string[];
}
export async function extractExplicitQuestions(params: ExtractExplicitQuestionsParams): Promise<ExtractExplicitQuestionsResult> {
  const { text, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that extracts explicit questions ONLY.
Task:
- Extract questions that are explicitly asked in the text.
Rules:
- Keep the question wording as close to the original as possible.
- Do NOT add implicit questions.
- Output valid JSON ONLY:
{"questions":["string",...]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract explicit questions. Guidance: ${guidance}
JSON ONLY: {"questions":["..."]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractExplicitQuestionsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 12) TASKS ATOM: Extract tasks ONLY
 * ============================================================ */
export interface ExtractTasksParams {
  text: string;
  guidance: string; // e.g. "only actionable items, ignore discussion"
  defaultOwner?: string; // e.g. "Ami"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ExtractTasksResult {
  tasks: Array<{ id: string; title: string; owner: string; evidence: string; confidence: number }>;
}
export async function extractTasks(params: ExtractTasksParams): Promise<ExtractTasksResult> {
  const { text, guidance, defaultOwner = "Unassigned", mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that extracts tasks ONLY.
Task:
- Convert actionable intents into task items.
For each task:
- id: "t1","t2",...
- title: starts with a verb (e.g., "Write...", "Decide...", "Add...")
- owner: if explicit in text; otherwise defaultOwner
- evidence: short snippet (<= 25 words)
- confidence: number 0..1 (lower if ambiguous)
Rules:
- Do NOT include non-actionable statements.
- Do NOT invent deadlines or owners not in the text.
- Output valid JSON ONLY:
{"tasks":[{"id":"t1","title":"...","owner":"...","evidence":"...","confidence":0.8}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract tasks. Guidance: ${guidance}
JSON ONLY: {"tasks":[{"id":"t1","title":"...","owner":"...","evidence":"...","confidence":0.8}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
DefaultOwner: ${defaultOwner}
  `.trim();

  const result = await callAI<ExtractTasksResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 13) TASKS ATOM: Normalize tasks ONLY (no extraction)
 * ============================================================ */
export interface NormalizeTasksParams {
  tasks: Array<{ id?: string; title?: string; description?: string; owner?: string }>;
  guidance: string; // e.g. "titles must be verbs; keep IDs if exist"
  defaultOwner?: string;
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface NormalizeTasksResult {
  tasks: Array<{ id: string; title: string; description: string; owner: string }>;
}
export async function normalizeTasks(params: NormalizeTasksParams): Promise<NormalizeTasksResult> {
  const { tasks, guidance, defaultOwner = "Unassigned", mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that normalizes tasks ONLY.
Task:
- Take the provided task objects and return normalized tasks.
Normalization rules:
- Ensure every task has id, title, description, owner.
- If id missing, generate "t1","t2",... in order.
- title must start with a verb and be <= 80 chars.
- description: 1-3 short sentences, derived from provided fields only.
- owner: preserve if provided, else use defaultOwner.
Rules:
- Do NOT add new tasks.
- Do NOT invent facts beyond what is in the task inputs.
- Output valid JSON ONLY:
{"tasks":[{"id":"t1","title":"...","description":"...","owner":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Normalize tasks. Guidance: ${guidance}
JSON ONLY: {"tasks":[{"id":"t1","title":"...","description":"...","owner":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Tasks: ${JSON.stringify(tasks)}
Guidance: ${guidance}
DefaultOwner: ${defaultOwner}
  `.trim();

  const result = await callAI<NormalizeTasksResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 14) TASKS ATOM: Deduplicate tasks ONLY
 * ============================================================ */
export interface DeduplicateTasksParams {
  tasks: Array<{ id: string; title: string; description?: string }>;
  guidance: string; // e.g. "treat near-duplicate titles as duplicates"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface DeduplicateTasksResult {
  deduped: Array<{ canonicalId: string; mergedIds: string[]; title: string; reason: string }>;
}
export async function deduplicateTasks(params: DeduplicateTasksParams): Promise<DeduplicateTasksResult> {
  const { tasks, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that deduplicates tasks ONLY.
Task:
- Group tasks that represent the same work.
Output groups where:
- canonicalId: the chosen representative task id
- mergedIds: all task ids in the group (including canonicalId)
- title: canonical title (cleaned)
- reason: why they are duplicates
Rules:
- Do NOT drop tasks; every input task id must appear in exactly one group.
- Prefer merging true duplicates; keep separate if meaning differs.
- Output valid JSON ONLY:
{"deduped":[{"canonicalId":"t1","mergedIds":["t1","t7"],"title":"...","reason":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Deduplicate tasks. Guidance: ${guidance}
JSON ONLY: {"deduped":[{"canonicalId":"t1","mergedIds":["t1"],"title":"...","reason":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Tasks: ${JSON.stringify(tasks)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<DeduplicateTasksResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 15) PRIORITY ATOM: Score tasks ONLY (ICE style)
 * ============================================================ */
export interface ScoreTasksICEParams {
  tasks: Array<{ id: string; title: string; description?: string }>;
  guidance: string; // e.g. "impact is user value, confidence is certainty, effort is eng-days"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ScoreTasksICEResult {
  scores: Array<{ id: string; impact: number; confidence: number; effort: number; ice: number; rationale: string[] }>;
}
export async function scoreTasksICE(params: ScoreTasksICEParams): Promise<ScoreTasksICEResult> {
  const { tasks, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that scores tasks using ICE ONLY.
Task:
- For each task, assign:
  - impact: 1..10
  - confidence: 1..10
  - effort: 1..10 (higher means more effort)
  - ice = (impact * confidence) / effort
  - rationale: 1-3 short bullets
Rules:
- Use relative scoring across tasks (consistent scale).
- Do NOT change tasks or add tasks.
- Output valid JSON ONLY:
{"scores":[{"id":"t1","impact":7,"confidence":6,"effort":3,"ice":14,"rationale":["..."]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Score tasks (ICE). Guidance: ${guidance}
JSON ONLY: {"scores":[{"id":"t1","impact":1,"confidence":1,"effort":1,"ice":1,"rationale":["..."]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Tasks: ${JSON.stringify(tasks)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ScoreTasksICEResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 16) PRIORITY ATOM: Order tasks ONLY (from given scores)
 * ============================================================ */
export interface OrderTasksParams {
  scores: Array<{ id: string; ice?: number; score?: number }>;
  guidance: string; // e.g. "sort descending by ice; tie-break by smaller effort"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface OrderTasksResult {
  ordered: Array<{ id: string; rank: number; reason: string }>;
}
export async function orderTasks(params: OrderTasksParams): Promise<OrderTasksResult> {
  const { scores, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that orders tasks ONLY.
Task:
- Produce a ranked list based on the provided numeric fields.
Rules:
- Do NOT invent new scores.
- If both "ice" and "score" exist, prefer "ice" unless guidance says otherwise.
- rank starts at 1.
- Output valid JSON ONLY:
{"ordered":[{"id":"t1","rank":1,"reason":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Order tasks. Guidance: ${guidance}
JSON ONLY: {"ordered":[{"id":"t1","rank":1,"reason":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Scores: ${JSON.stringify(scores)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<OrderTasksResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 17) PLANNING ATOM: Create milestones ONLY
 * ============================================================ */
export interface GenerateMilestonesParams {
  objective: string;
  guidance: string; // e.g. "4 milestones, MVP-first, include validation"
  count?: number;   // default 5
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface GenerateMilestonesResult {
  milestones: Array<{ id: string; title: string; successCriteria: string[] }>;
}
export async function generateMilestones(params: GenerateMilestonesParams): Promise<GenerateMilestonesResult> {
  const { objective, guidance, count = 5, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that generates milestones ONLY.
Task:
- Create exactly ${count} milestones to achieve the objective.
For each milestone:
- id: "m1","m2",...
- title: short
- successCriteria: 2-5 measurable criteria
Rules:
- No steps, no task breakdown here (milestones only).
- Output valid JSON ONLY:
{"milestones":[{"id":"m1","title":"...","successCriteria":["..."]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Generate ${count} milestones. Guidance: ${guidance}
JSON ONLY: {"milestones":[{"id":"m1","title":"...","successCriteria":["..."]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Objective: ${objective}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<GenerateMilestonesResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 18) PLANNING ATOM: Derive dependencies ONLY (task graph)
 * ============================================================ */
export interface DeriveDependenciesParams {
  tasks: Array<{ id: string; title: string; description?: string }>;
  guidance: string; // e.g. "deps are hard blockers; keep minimal edges"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface DeriveDependenciesResult {
  dependencies: Array<{ beforeId: string; afterId: string; reason: string }>;
}
export async function deriveDependencies(params: DeriveDependenciesParams): Promise<DeriveDependenciesResult> {
  const { tasks, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that derives task dependencies ONLY.
Task:
- Identify which tasks must happen before others (hard blockers).
Rules:
- Keep dependency edges minimal (avoid redundant edges).
- Use only provided task ids.
- Output valid JSON ONLY:
{"dependencies":[{"beforeId":"t1","afterId":"t2","reason":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Derive dependencies. Guidance: ${guidance}
JSON ONLY: {"dependencies":[{"beforeId":"t1","afterId":"t2","reason":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Tasks: ${JSON.stringify(tasks)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<DeriveDependenciesResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 19) NARRATIVE ATOM: Detect narrative signals ONLY
 * ============================================================ */
export interface DetectNarrativeSignalsParams {
  text: string;
  guidance: string; // e.g. "risk narratives only"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface DetectNarrativeSignalsResult {
  signals: string[];
  confidence: number; // 0..1
}
export async function detectNarrativeSignals(params: DetectNarrativeSignalsParams): Promise<DetectNarrativeSignalsResult> {
  const { text, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that detects narrative signals ONLY.
Task:
- Identify narrative signals such as: actors, intent, causality, conflict/tension, escalation, resolution, stakes.
Rules:
- List only signals that are supported by the text.
- confidence: 0..1 overall confidence that the text contains a coherent narrative for the given guidance.
- Output valid JSON ONLY:
{"signals":["..."],"confidence":0.0}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Detect narrative signals. Guidance: ${guidance}
JSON ONLY: {"signals":["..."],"confidence":0.0}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<DetectNarrativeSignalsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 20) NARRATIVE ATOM: Extract narrative slots ONLY
 * ============================================================ */
export interface ExtractNarrativeSlotsParams {
  text: string;
  guidance: string; // e.g. "incident narrative; focus on what/why/impact"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface ExtractNarrativeSlotsResult {
  slots: {
    actors: string[];
    setting: string;
    timeline: string;
    events: Array<{ what: string; soWhat: string }>;
    motivations: string[];
    tensions: string[];
    outcome: string;
    evidence: string[];
  };
  gaps: string[];
}
export async function extractNarrativeSlots(params: ExtractNarrativeSlotsParams): Promise<ExtractNarrativeSlotsResult> {
  const { text, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that extracts narrative slots ONLY.
Task:
- Fill the slots from the text. If info is missing, leave empty strings/arrays and list the missing info in "gaps".
Rules:
- Do NOT invent facts.
- evidence: short supporting snippets (<= 25 words each), up to 6 items.
- Output valid JSON ONLY with this exact schema:
{
  "slots":{
    "actors":["..."],
    "setting":"...",
    "timeline":"...",
    "events":[{"what":"...","soWhat":"..."}],
    "motivations":["..."],
    "tensions":["..."],
    "outcome":"...",
    "evidence":["..."]
  },
  "gaps":["..."]
}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract narrative slots. Guidance: ${guidance}
JSON ONLY: {"slots":{"actors":[],"setting":"","timeline":"","events":[],"motivations":[],"tensions":[],"outcome":"","evidence":[]},"gaps":[]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractNarrativeSlotsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 21) NARRATIVE ATOM: Write narrative from slots ONLY
 * ============================================================ */
export interface WriteNarrativeFromSlotsParams {
  slots: ExtractNarrativeSlotsResult["slots"];
  guidance: string; // e.g. "executive summary, 120-160 words, neutral tone"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface WriteNarrativeFromSlotsResult {
  narrative: string;
}
export async function writeNarrativeFromSlots(params: WriteNarrativeFromSlotsParams): Promise<WriteNarrativeFromSlotsResult> {
  const { slots, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that writes a narrative from slots ONLY.
Task:
- Write a coherent narrative using only the provided slots.
Rules:
- Do NOT introduce facts not present in slots.
- Keep it chronological when possible.
- Follow the guidance strictly (tone/length/style).
- Output valid JSON ONLY:
{"narrative":"string"}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Write narrative from slots. Guidance: ${guidance}
JSON ONLY: {"narrative":"..."}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Slots: ${JSON.stringify(slots)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<WriteNarrativeFromSlotsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * 22) (Optional extra) SUMMARIZATION ATOM: Summarize ONLY
 * ============================================================ */
export interface SummarizeTextParams {
  text: string;
  guidance: string; // e.g. "5 bullets max" / "1 paragraph"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}
export interface SummarizeTextResult {
  summary: string;
}
export async function summarizeText(params: SummarizeTextParams): Promise<SummarizeTextResult> {
  const { text, guidance, mode = "strong", client, model = "gpt-4o-mini", additionalInstructions } = params;

  const strongInstructions = `
You are an AI assistant that summarizes text ONLY.
Task:
- Produce a summary according to guidance.
Rules:
- Do NOT add new facts.
- Preserve key details.
- Output valid JSON ONLY:
{"summary":"string"}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Summarize. Guidance: ${guidance}
JSON ONLY: {"summary":"..."}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<SummarizeTextResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}
```


```ts
import { callAI } from "../callAI.js";
import type { Client } from "../../src/index.js";

type Mode = "weak" | "strong";

function withAdditional(additionalInstructions?: string) {
  return additionalInstructions ? `\nAdditional Instructions: ${additionalInstructions}\n` : "\n";
}

/* ============================================================
 * write.extract_style_rules (style rules ONLY)
 * ============================================================ */
export interface ExtractStyleRulesParams {
  text: string;                 // sample text to infer style from (or a style guide snippet)
  guidance: string;             // e.g. "B2B SaaS, concise, no hype"
  maxRules?: number;            // default 12
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}

export type StyleRuleScope =
  | "tone"
  | "voice"
  | "length"
  | "format"
  | "terminology"
  | "structure"
  | "punctuation"
  | "do_dont";

export interface ExtractStyleRulesResult {
  rules: Array<{
    id: string;                 // r1, r2...
    scope: StyleRuleScope;
    rule: string;               // the actual rule
    evidence?: string;          // <= 25 words snippet showing why the rule exists (optional)
    priority: "must" | "should";
  }>;
}

export async function extractStyleRules(
  params: ExtractStyleRulesParams
): Promise<ExtractStyleRulesResult> {
  const {
    text,
    guidance,
    maxRules = 12,
    mode = "strong",
    client,
    model = "gpt-4o-mini",
    additionalInstructions,
  } = params;

  const strongInstructions = `
You are an AI assistant that extracts STYLE RULES ONLY.
Task:
- Infer a compact set of writing style rules from the provided text sample and guidance.
Rules:
- Output ONLY style rules. Do NOT summarize the text. Do NOT produce rewritten text. Do NOT propose content.
- Each rule must be specific and testable ("Do X", "Avoid Y"), not vague ("Be clear").
- Provide up to ${maxRules} rules, sorted by importance.
- "evidence" is optional; if used, it must be a short snippet (<= 25 words) copied from the input text.
- Output valid JSON ONLY with EXACT schema:
{
  "rules": [
    {"id":"r1","scope":"tone|voice|length|format|terminology|structure|punctuation|do_dont","rule":"string","evidence":"string?","priority":"must|should"}
  ]
}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract up to ${maxRules} style rules. Guidance: ${guidance}
JSON ONLY:
{"rules":[{"id":"r1","scope":"tone","rule":"...","evidence":"...","priority":"must"}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
TextSample: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractStyleRulesResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * extract.requirements (requirements ONLY)
 * ============================================================ */
export interface ExtractRequirementsParams {
  text: string;
  guidance: string;                 // e.g. "software product requirements; keep atomic"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}

export type RequirementType =
  | "functional"
  | "non_functional"
  | "constraint"
  | "assumption"
  | "unknown";

export type RequirementPriority =
  | "must"
  | "should"
  | "could"
  | "wont"
  | "unspecified";

export interface ExtractRequirementsResult {
  requirements: Array<{
    id: string;                      // req1, req2...
    statement: string;               // atomic requirement statement
    type: RequirementType;
    priority: RequirementPriority;
    evidence: string;                // <= 25 words snippet from text
    ambiguity: "none" | "some" | "high";
  }>;
}

export async function extractRequirements(
  params: ExtractRequirementsParams
): Promise<ExtractRequirementsResult> {
  const {
    text,
    guidance,
    mode = "strong",
    client,
    model = "gpt-4o-mini",
    additionalInstructions,
  } = params;

  const strongInstructions = `
You are an AI assistant that extracts REQUIREMENTS ONLY.
Task:
- Extract requirement statements from the text.
Rules:
- Output ONLY requirements. Do NOT output tasks, plans, solutions, designs, or recommendations.
- Each requirement must be atomic (one idea). Split combined statements into multiple requirements.
- "evidence" must be a short snippet (<= 25 words) copied from the input text that supports the requirement.
- "type" must be one of: functional | non_functional | constraint | assumption | unknown
- "priority" must be one of: must | should | could | wont | unspecified
- "ambiguity" reflects how clear/measurable the requirement is (none/some/high).
- Output valid JSON ONLY with EXACT schema:
{
  "requirements":[
    {"id":"req1","statement":"string","type":"functional|non_functional|constraint|assumption|unknown","priority":"must|should|could|wont|unspecified","evidence":"string","ambiguity":"none|some|high"}
  ]
}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract requirements only. Guidance: ${guidance}
JSON ONLY:
{"requirements":[{"id":"req1","statement":"...","type":"functional","priority":"must","evidence":"...","ambiguity":"some"}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractRequirementsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * extract.decisions (decisions ONLY)
 * ============================================================ */
export interface ExtractDecisionsParams {
  text: string;
  guidance: string;                 // e.g. "product/engineering decisions; include proposed vs made"
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}

export type DecisionStatus = "made" | "proposed" | "open";

export interface ExtractDecisionsResult {
  decisions: Array<{
    id: string;                      // d1, d2...
    decision: string;                // normalized decision statement
    status: DecisionStatus;          // made/proposed/open
    chosenOption?: string;           // if explicit
    alternatives?: string[];         // if explicit
    rationale?: string;              // if explicit
    owner?: string;                  // if explicit
    date?: string;                   // if explicit in text (keep original form)
    evidence: string;                // <= 25 words snippet from text
  }>;
}

export async function extractDecisions(
  params: ExtractDecisionsParams
): Promise<ExtractDecisionsResult> {
  const {
    text,
    guidance,
    mode = "strong",
    client,
    model = "gpt-4o-mini",
    additionalInstructions,
  } = params;

  const strongInstructions = `
You are an AI assistant that extracts DECISIONS ONLY.
Task:
- Identify decisions in the text (explicit decisions, proposed decisions, and undecided decision points).
Rules:
- Output ONLY decisions. Do NOT output tasks, requirements, plans, or general discussion.
- A decision must be framed as "we will / we decided / choose / prefer / go with / not doing X" OR a clear decision point with options.
- "status":
  - made: decision is clearly final/selected
  - proposed: suggested but not clearly final
  - open: decision point exists but no selection
- Only include chosenOption/alternatives/rationale/owner/date if explicitly supported by the text.
- "evidence" must be a short snippet (<= 25 words) copied from the input text.
- Output valid JSON ONLY with EXACT schema:
{
  "decisions":[
    {"id":"d1","decision":"string","status":"made|proposed|open","chosenOption":"string?","alternatives":["string"]?,"rationale":"string?","owner":"string?","date":"string?","evidence":"string"}
  ]
}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Extract decisions only. Guidance: ${guidance}
JSON ONLY:
{"decisions":[{"id":"d1","decision":"...","status":"open","chosenOption":"...","alternatives":["..."],"rationale":"...","owner":"...","date":"...","evidence":"..."}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Text: ${text}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<ExtractDecisionsResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}

/* ============================================================
 * plan.create_step_list_from_milestone (steps ONLY)
 * ============================================================ */
export interface CreateStepListFromMilestoneParams {
  milestone: {
    title: string;
    successCriteria?: string[];      // optional
    context?: string;               // optional milestone context
  };
  guidance: string;                 // e.g. "engineering steps; keep 6-12 steps; no fluff"
  maxSteps?: number;                // default 10
  mode?: Mode;
  client?: Client;
  model?: string;
  additionalInstructions?: string;
}

export interface CreateStepListFromMilestoneResult {
  steps: Array<{
    id: string;                      // s1, s2...
    action: string;                  // starts with verb
    output: string;                  // concrete deliverable/output of the step
    dependsOn: string[];             // step ids
  }>;
}

export async function createStepListFromMilestone(
  params: CreateStepListFromMilestoneParams
): Promise<CreateStepListFromMilestoneResult> {
  const {
    milestone,
    guidance,
    maxSteps = 10,
    mode = "strong",
    client,
    model = "gpt-4o-mini",
    additionalInstructions,
  } = params;

  const strongInstructions = `
You are an AI assistant that produces STEPS ONLY for a single milestone.
Task:
- Create an ordered list of actionable steps that achieve the milestone.
Rules:
- Output ONLY steps. Do NOT output milestones, tasks outside this milestone, timelines, owners, or priorities.
- Steps must be concrete actions that start with a verb.
- Each step must have a clear "output" deliverable.
- Keep dependencies minimal and valid (dependsOn references earlier step ids only).
- Produce up to ${maxSteps} steps; fewer is fine if sufficient.
- Use milestone successCriteria as acceptance targets (but do not repeat them verbatim unless necessary).
- Output valid JSON ONLY with EXACT schema:
{
  "steps":[
    {"id":"s1","action":"string","output":"string","dependsOn":["s0"...]}
  ]
}
${withAdditional(additionalInstructions)}
  `.trim();

  const weakInstructions = `
Create steps only (max ${maxSteps}). Guidance: ${guidance}
JSON ONLY:
{"steps":[{"id":"s1","action":"...","output":"...","dependsOn":[]}]}
${withAdditional(additionalInstructions)}
  `.trim();

  const prompt = `
Milestone: ${JSON.stringify(milestone)}
Guidance: ${guidance}
  `.trim();

  const result = await callAI<CreateStepListFromMilestoneResult>({
    client,
    mode,
    instructions: { strong: strongInstructions, weak: weakInstructions },
    prompt,
    model,
  });

  return result.data;
}
```

