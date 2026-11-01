import { createHash } from "node:crypto";
import Redis from "ioredis";

/**
 * Answer cache in Redis.
 *
 * Key = hash(normalised question + the exact set of chunk ids retrieved + model).
 * Retrieval still runs on every request (~100 ms) — only the LLM call (seconds, and the scarce
 * resource on a free tier) is skipped. Keying on the retrieved chunks makes the cache:
 *  - permission-safe: users who can see different documents retrieve different chunks,
 *    so they can never be served each other's answers;
 *  - self-invalidating: upload or delete a document and retrieval changes, so the key changes.
 *
 * The cache is best-effort: if Redis is down or unset, chat still works, just uncached.
 */
const TTL_SECONDS = 60 * 60 * 24;

export interface CachedAnswer {
  text: string;
}

export function normaliseQuestion(q: string): string {
  return q
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerCacheKey(question: string, chunkIds: string[], model: string): string {
  const material = JSON.stringify([normaliseQuestion(question), [...chunkIds].sort(), model]);
  return `docmind:answer:${createHash("sha256").update(material).digest("hex")}`;
}

const globalForRedis = globalThis as unknown as { redis?: Redis | null };

function client(): Redis | null {
  if (globalForRedis.redis === undefined) {
    const url = process.env.REDIS_URL;
    globalForRedis.redis = url
      ? new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false, lazyConnect: false })
      : null;
    // Log once instead of crashing the app when Redis is unavailable.
    globalForRedis.redis?.on("error", (e) => console.warn("[cache] redis error:", e.message));
  }
  return globalForRedis.redis;
}

export async function getCachedAnswer(key: string): Promise<CachedAnswer | null> {
  try {
    const raw = await client()?.get(key);
    return raw ? (JSON.parse(raw) as CachedAnswer) : null;
  } catch {
    return null;
  }
}

export async function setCachedAnswer(key: string, value: CachedAnswer): Promise<void> {
  try {
    await client()?.set(key, JSON.stringify(value), "EX", TTL_SECONDS);
  } catch {
    // best-effort
  }
}

export async function closeCache() {
  await globalForRedis.redis?.quit().catch(() => {});
  globalForRedis.redis = undefined;
}
