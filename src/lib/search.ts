import { cosineDistance, desc, eq, sql } from "drizzle-orm";
import { withUser } from "@/db";
import { chunks, documents } from "@/db/schema";
import { embedQuery } from "./embed";
import { reciprocalRankFusion } from "./rrf";

export interface SearchHit {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  heading: string | null;
  content: string;
  score: number;
  /** Rank in [vector, keyword] lists — useful for debugging and for the eval report. */
  ranks: (number | null)[];
}

export type SearchMode = "hybrid" | "vector" | "keyword";

export interface SearchOptions {
  limit?: number;
  /** How many candidates each retriever contributes before fusion. */
  candidates?: number;
  /** "vector" / "keyword" exist so the eval suite can measure what hybrid adds. */
  mode?: SearchMode;
}

/**
 * Candidates per retriever before fusion. Kept small on purpose: RRF rewards items found by
 * *both* retrievers, so if each list is a large share of the corpus, almost any incidental
 * keyword match ("note" → "Alice's Notes") counts as "found twice" and outranks the true #1.
 * Measured on the eval set: 20 → 96% recall@5, 10 → 100% (README → Evaluation).
 * Override with RETRIEVAL_CANDIDATES to re-run the sweep.
 */
const DEFAULT_CANDIDATES = Number(process.env.RETRIEVAL_CANDIDATES ?? 10);

/**
 * Hybrid retrieval: semantic (pgvector) + lexical (Postgres full-text), fused with RRF.
 *
 * Vectors catch paraphrases ("time off" ≈ "leave"); full-text catches exact terms that
 * embeddings blur — policy numbers, error codes, product names. Each covers the other's blind spot.
 *
 * Runs as `userId` under row-level security, so only documents that user may see are searched.
 */
export async function hybridSearch(
  userId: string,
  query: string,
  opts: SearchOptions = {},
): Promise<SearchHit[]> {
  const limit = opts.limit ?? 5;
  const candidates = opts.candidates ?? DEFAULT_CANDIDATES;
  const mode = opts.mode ?? "hybrid";

  const selection = {
    chunkId: chunks.id,
    documentId: chunks.documentId,
    documentTitle: documents.title,
    heading: chunks.heading,
    content: chunks.content,
  };

  const queryEmbedding = mode === "keyword" ? null : await embedQuery(query);
  // OR the query terms instead of AND-ing them. websearch_to_tsquery requires *every* word to
  // match, so a natural question ("how much paid time off do I get?") would return nothing.
  // plainto_tsquery stems and drops stop words; we then swap its & for |, and ts_rank_cd
  // still ranks chunks that match more of the terms higher.
  const tsQuery = sql`to_tsquery('english', replace(plainto_tsquery('english', ${query})::text, '&', '|'))`;

  const [semantic, lexical] = await withUser(userId, (tx) =>
    // Sequential within one transaction (a transaction is a single connection).
    (async () => {
      const semantic = queryEmbedding
        ? await tx
            .select(selection)
            .from(chunks)
            .innerJoin(documents, eq(chunks.documentId, documents.id))
            .orderBy(cosineDistance(chunks.embedding, queryEmbedding)) // served by the HNSW index
            .limit(candidates)
        : [];
      const lexical =
        mode === "vector"
          ? []
          : await tx
              .select(selection)
              .from(chunks)
              .innerJoin(documents, eq(chunks.documentId, documents.id))
              .where(sql`${chunks.searchVector} @@ ${tsQuery}`)
              .orderBy(desc(sql`ts_rank_cd(${chunks.searchVector}, ${tsQuery})`))
              .limit(candidates);
      return [semantic, lexical] as const;
    })(),
  );

  return reciprocalRankFusion([semantic, lexical], (r) => r.chunkId)
    .slice(0, limit)
    .map(({ item, score, ranks }) => ({ ...item, score, ranks }));
}

/** "Leave Policy › Annual Leave" — drops the H1 from the heading path when it repeats the title. */
export function citationLabel(documentTitle: string, heading: string | null): string {
  if (!heading) return documentTitle;
  const parts = heading.split(" › ");
  if (parts[0] === documentTitle) parts.shift();
  return [documentTitle, ...parts].join(" › ");
}
