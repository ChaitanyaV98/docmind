import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { withUser } from "@/db";
import { chunks, documents } from "@/db/schema";
import { chunkText } from "./chunk";
import { embedDocuments } from "./embed";

export interface IngestInput {
  title: string;
  source: string;
  text: string;
  /** Visible to the whole team, not just the owner. */
  shared?: boolean;
}

export interface IngestResult {
  documentId: string;
  chunkCount: number;
  skipped: boolean;
}

/**
 * Chunk → embed → store one document, owned by `userId`.
 *
 * - Idempotent per owner: keyed on a hash of the text, so re-ingesting never duplicates chunks.
 * - Embeddings are computed *before* the transaction opens, so a slow model never holds
 *   database locks; the document and its chunks are then written atomically (all or nothing).
 * - Runs under row-level security as the owner, so the database itself refuses to attach
 *   chunks to anyone else's document.
 */
export async function ingestDocument(userId: string, input: IngestInput): Promise<IngestResult> {
  const { title, source, text, shared = false } = input;
  const contentHash = createHash("sha256").update(text).digest("hex");

  const existing = await withUser(userId, (tx) =>
    tx
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.ownerId, userId), eq(documents.contentHash, contentHash))),
  );
  if (existing[0]) return { documentId: existing[0].id, chunkCount: 0, skipped: true };

  const pieces = chunkText(text);
  if (pieces.length === 0) throw new Error(`"${title}" has no text to ingest`);

  // Embed heading + content so a chunk under "Travel" matches travel questions
  // even when the word never appears in the paragraph itself.
  const vectors = await embedDocuments(
    pieces.map((p) => (p.heading ? `${p.heading}\n${p.content}` : p.content)),
  );

  const documentId = await withUser(userId, async (tx) => {
    const [doc] = await tx
      .insert(documents)
      .values({ ownerId: userId, shared, title, source, contentHash })
      .returning({ id: documents.id });
    await tx.insert(chunks).values(
      pieces.map((p, i) => ({
        documentId: doc.id,
        chunkIndex: p.index,
        heading: p.heading,
        content: p.content,
        embedding: vectors[i],
      })),
    );
    return doc.id;
  });

  return { documentId, chunkCount: pieces.length, skipped: false };
}
