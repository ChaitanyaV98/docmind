import { EMBEDDING_DIMENSIONS } from "@/db/schema";

/**
 * Embeddings, from one of two providers (EMBED_PROVIDER):
 *
 *  - "ollama" (default, local): nomic-embed-text — free, private, offline.
 *  - "gemini" (hosted): gemini-embedding-001 at 768 dimensions, for serverless deploys where
 *    Ollama can't run. Free tier via a Google AI Studio key (GEMINI_API_KEY).
 *
 * Both distinguish documents from queries: nomic via text prefixes, Gemini via `taskType`.
 * Forgetting this is a common silent RAG bug.
 *
 * IMPORTANT: vectors from different models are not comparable. A database must be ingested
 * with the same provider that embeds its queries — switching providers means re-ingesting.
 */
type Kind = "document" | "query";

const OLLAMA_BATCH = 32;
const GEMINI_BATCH = 100; // batchEmbedContents accepts up to 100 texts per call

function provider(): "ollama" | "gemini" {
  const p = process.env.EMBED_PROVIDER ?? "ollama";
  if (p !== "ollama" && p !== "gemini") throw new Error(`Unknown EMBED_PROVIDER "${p}"`);
  return p;
}

function checkDimensions(vectors: number[][], model: string): number[][] {
  for (const v of vectors) {
    if (v.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embeddings from ${model}, got ${v.length}`);
    }
  }
  return vectors;
}

async function ollamaEmbed(texts: string[], kind: Kind): Promise<number[][]> {
  const url = process.env.OLLAMA_URL ?? "http://localhost:11434";
  const model = process.env.EMBED_MODEL ?? "nomic-embed-text";
  const prefix = kind === "document" ? "search_document: " : "search_query: ";
  const res = await fetch(`${url}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: texts.map((t) => prefix + t) }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed failed (${res.status}): ${await res.text()}. Is Ollama running?`);
  }
  const { embeddings } = (await res.json()) as { embeddings: number[][] };
  return checkDimensions(embeddings, model);
}

async function geminiEmbed(texts: string[], kind: Kind): Promise<number[][]> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set (required when EMBED_PROVIDER=gemini)");
  const model = process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${model}`,
          content: { parts: [{ text }] },
          taskType: kind === "document" ? "RETRIEVAL_DOCUMENT" : "RETRIEVAL_QUERY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        })),
      }),
    },
  );
  if (!res.ok) throw new Error(`Gemini embed failed (${res.status}): ${await res.text()}`);
  const { embeddings } = (await res.json()) as { embeddings: { values: number[] }[] };
  return checkDimensions(
    embeddings.map((e) => e.values),
    model,
  );
}

async function embed(texts: string[], kind: Kind): Promise<number[][]> {
  const p = provider();
  const batch = p === "gemini" ? GEMINI_BATCH : OLLAMA_BATCH;
  const run = p === "gemini" ? geminiEmbed : ollamaEmbed;
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += batch) {
    out.push(...(await run(texts.slice(i, i + batch), kind)));
  }
  return out;
}

export const embedDocuments = (texts: string[]) => embed(texts, "document");

export async function embedQuery(query: string): Promise<number[]> {
  const [vector] = await embed([query], "query");
  return vector;
}

/** Recorded in eval reports so results are tied to the model that produced them. */
export function embeddingModelId(): string {
  return provider() === "gemini"
    ? `gemini:${process.env.GEMINI_EMBED_MODEL ?? "gemini-embedding-001"}`
    : `ollama:${process.env.EMBED_MODEL ?? "nomic-embed-text"}`;
}
