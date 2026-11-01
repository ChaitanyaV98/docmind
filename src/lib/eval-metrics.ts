/** Pure scoring helpers for the eval suite (unit-tested in eval-metrics.test.ts). */

/** A retrieved label matches an expected one if it is that section or a sub-section of it. */
export function labelMatches(label: string, expected: string): boolean {
  return label === expected || label.startsWith(`${expected} ›`);
}

/** 1-based rank of the first relevant result, or null if none of the results are relevant. */
export function firstRelevantRank(labels: string[], expected: string[]): number | null {
  const i = labels.findIndex((l) => expected.some((e) => labelMatches(l, e)));
  return i === -1 ? null : i + 1;
}

export interface RetrievalScores {
  cases: number;
  recallAt1: number;
  recallAt3: number;
  recallAt5: number;
  /** Mean reciprocal rank: 1 if the answer is always first, 0.5 if always second, … */
  mrr: number;
}

/** Aggregate first-relevant ranks (null = not found in the top 5) into recall@k and MRR. */
export function scoreRetrieval(ranks: (number | null)[]): RetrievalScores {
  const n = ranks.length || 1;
  const within = (k: number) => ranks.filter((r) => r !== null && r <= k).length / n;
  return {
    cases: ranks.length,
    recallAt1: within(1),
    recallAt3: within(3),
    recallAt5: within(5),
    mrr: ranks.reduce<number>((sum, r) => sum + (r ? 1 / r : 0), 0) / n,
  };
}

/** Compare numbers and phrases loosely: case-insensitive, ignoring ₹, commas and extra spaces. */
export function normaliseForMatch(s: string): string {
  return s.toLowerCase().replace(/[₹,]/g, "").replace(/\s+/g, " ").trim();
}

export function missingFacts(answer: string, facts: string[]): string[] {
  const a = normaliseForMatch(answer);
  return facts.filter((f) => !a.includes(normaliseForMatch(f)));
}
