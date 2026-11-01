import { EMBEDDING_DIMENSIONS } from "@/db/schema";

/**
 * Embeddings via a local Ollama server (free, private, no API key).
 *
 * nomic-embed-text is trained with task prefixes: documents and queries are embedded
 * differently, which measurably improves retrieval. Forgetting the prefixes is a common RAG bug.
 */
const BATCH_SIZE = 32;

function config() {
  return {
    url: process.env.OLLAMA_URL ?? "http://localhost:11434",
    model: process.env.EMBED_MODEL ?? "nomic-embed-text",
  };
}

async function embedRaw(inputs: string[]): Promise<number[][]> {
  const { url, model } = config();
  const res = await fetch(`${url}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input: inputs }),
  });
  if (!res.ok) {
    throw new Error(`Ollama embed failed (${res.status}): ${await res.text()}. Is Ollama running?`);
  }
  const { embeddings } = (await res.json()) as { embeddings: number[][] };
  for (const e of embeddings) {
    if (e.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(`Expected ${EMBEDDING_DIMENSIONS}-dim embeddings from ${model}, got ${e.length}`);
    }
  }
  return embeddings;
}

export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE).map((t) => `search_document: ${t}`);
    out.push(...(await embedRaw(batch)));
  }
  return out;
}

export async function embedQuery(query: string): Promise<number[]> {
  const [embedding] = await embedRaw([`search_query: ${query}`]);
  return embedding;
}
