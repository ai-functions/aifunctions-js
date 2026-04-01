export type CandidateId = string | number;

export type MatchCandidate = {
  id: CandidateId;
  label: string;
  metadata?: Record<string, unknown>;
};

export type IndexedCandidate = MatchCandidate & { idx: number };

export function indexCandidates(candidates: MatchCandidate[]): {
  indexed: IndexedCandidate[];
  byIdx: Map<number, IndexedCandidate>;
} {
  const indexed: IndexedCandidate[] = candidates.map((c, i) => ({ ...c, idx: i + 1 }));
  const byIdx = new Map<number, IndexedCandidate>();
  for (const c of indexed) byIdx.set(c.idx, c);
  return { indexed, byIdx };
}

export function renderIndexedCandidatesForPrompt(indexed: IndexedCandidate[]): string {
  // Keep this compact and deterministic; metadata is omitted to avoid blowing up prompt size.
  // Callers can incorporate metadata into the label if needed.
  return indexed.map((c) => `${c.idx}) ${c.label}`).join("\n");
}

export function clamp01(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

