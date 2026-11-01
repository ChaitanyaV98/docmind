import { citationLabel, type SearchHit } from "./search";

/** What the client needs to render a citation chip; [n] in the answer refers to sources[n-1]. */
export interface Source {
  n: number;
  chunkId: string;
  documentId: string;
  label: string;
  excerpt: string;
}

export function toSources(hits: SearchHit[]): Source[] {
  return hits.map((h, i) => ({
    n: i + 1,
    chunkId: h.chunkId,
    documentId: h.documentId,
    label: citationLabel(h.documentTitle, h.heading),
    excerpt: h.content,
  }));
}

/**
 * Grounding rules. The model may only use the numbered sources, must cite them inline,
 * and must say so when the answer isn't there — refusing is better than inventing.
 */
export const ANSWER_INSTRUCTIONS = `You are DocMind, an assistant that answers questions using ONLY the numbered sources provided.

Rules:
- Use only facts stated in the sources. Never use outside knowledge, and never guess.
- Cite every factual sentence with the source number in square brackets, e.g. "Hotels are capped at ₹6,000 per night [2]." Cite multiple sources like [1][3].
- If the sources do not contain the answer, reply exactly: "I couldn't find that in your documents." Do not add anything else.
- Be concise: answer in 1–4 sentences or a short list. Quote exact numbers, dates and names from the sources.`;

/** The user turn sent to the model: sources first, then the question. */
export function buildGroundedPrompt(question: string, sources: Source[]): string {
  const context = sources
    .map((s) => `[${s.n}] ${s.label}\n${s.excerpt}`)
    .join("\n\n---\n\n");
  return `Sources:\n\n${context || "(no sources found)"}\n\n---\n\nQuestion: ${question}`;
}

export const NOT_FOUND_ANSWER = "I couldn't find that in your documents.";

/** Which [n] markers an answer actually uses — for rendering and for the citation eval. */
export function citedSourceNumbers(answer: string): number[] {
  const nums = new Set<number>();
  for (const m of answer.matchAll(/\[(\d+)\]/g)) nums.add(Number(m[1]));
  return [...nums].sort((a, b) => a - b);
}
