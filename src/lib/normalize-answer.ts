/**
 * Model output → canonical text. Some models (e.g. gpt-oss) cite as 【1】 instead of [1] and
 * write identifiers with Unicode hyphens (PLAT‑812 with U+2011), which breaks citation chips
 * and exact-match checks. Pure and client-safe: used by the chat UI, the cache and the evals.
 */
export function normalizeAnswer(text: string): string {
  return text
    .replace(/[【［]\s*(\d+)\s*[】］]/g, "[$1]")
    .replace(/[‐‑]/g, "-");
}
