# DocMind

[![CI](https://github.com/ChaitanyaV98/docmind/actions/workflows/ci.yml/badge.svg)](https://github.com/ChaitanyaV98/docmind/actions/workflows/ci.yml)

Chat with your team's documents and get answers with exact source citations — built to **measure**
answer quality and **enforce** who can see what, not just demo it.

> Status: feature-complete locally — auth, per-user access control, PDF/Markdown upload, streaming
> cited answers, answer cache and an eval suite in CI. Deployment (Vercel + Neon) is next.

## Highlights

- **Hybrid retrieval** — pgvector semantic search + Postgres full-text, merged with Reciprocal Rank Fusion. **100% recall@5** on the golden set.
- **Access control in the database** — Postgres row-level security: users see their own documents plus team-shared ones. App bugs can't leak data; retrieval for the LLM goes through the same rules. **0 leaks** across the eval, enforced in CI.
- **Grounded, cited answers** — streamed with the Vercel AI SDK; every fact carries a `[n]` citation that opens the exact source excerpt; refuses when the answer isn't in your documents.
- **Eval suite in CI** — 31 golden cases: retrieval recall@k / MRR per retriever, answer fact-accuracy, citation correctness, refusals, permission checks, and LLM-as-judge faithfulness.
- **Answer cache** — Redis, keyed on question + retrieved chunk set: permission-safe and self-invalidating. Cached answers return in **~190 ms vs ~13 s**.

## How it works

```
 Upload (PDF / Markdown / text)                     Ask
 ──────────────────────────────                     ───
 extract text ─► chunk (heading-aware) ─► embed     question ─► session check ─► hybrid search AS THIS USER (RLS)
                                           │                                        │ pgvector top-10 + full-text top-10
                                           ▼                                        ▼ Reciprocal Rank Fusion
 Postgres 17 ── users                                                    top-6 chunks ─► Redis cache hit? ─► stream cached
             ── documents (owner, shared)   ◄── row-level security                       │ miss
             ── chunks (vector(768) HNSW,                                                 ▼
                         tsvector GIN)                                   LLM (Groq / Ollama) streams answer with [n] citations
```

## Stack

Next.js 16 (App Router, Server Actions, Cache Components) · TypeScript · PostgreSQL 17 + pgvector ·
Drizzle ORM · Vercel AI SDK 7 · Groq (free tier) / Ollama · Redis · jose (JWT sessions) · Vitest ·
GitHub Actions

## Run it locally

Needs Docker, Node 24 and [Ollama](https://ollama.com).

```bash
cp .env.example .env              # then set AUTH_SECRET (openssl rand -base64 32) and GROQ_API_KEY
ollama pull nomic-embed-text      # embeddings
npm install
npm run db:up                     # Postgres + pgvector on :5434, Redis on :6380
npm run db:migrate
npm run seed                      # demo users + sample handbook
npm run dev
```

Sign in as `alice@lumen.dev` or `bob@lumen.dev` (password `docmind-demo`). Both see the shared
handbook; each also has private notes the other can't see — ask Bob about "PLAT-812" and he gets nothing.

No Groq key? Set `LLM_PROVIDER=ollama` and `ollama pull qwen2.5:1.5b` to run fully offline (lower answer quality).

| Command | What it does |
|---|---|
| `npm test` | Unit tests — chunking, rank fusion, citations, eval metrics |
| `npm run test:int` | Integration tests — row-level security against the real database |
| `npm run eval` | Retrieval eval: vector vs keyword vs hybrid |
| `npm run eval -- --answers --judge` | + answer accuracy, citations, refusals, LLM-as-judge faithfulness |
| `npm run search -- --as alice@lumen.dev "ERR-5310"` | Inspect retrieval ranks from the CLI |

## Evaluation

The golden set (`evals/golden.json`) has 31 cases written against the sample documents: paraphrases
("doctor's note" → "medical certificate"), exact identifiers (`ERR-5310`, `pg_stat_activity`,
`PLAT-812`), unanswerable questions, private documents, and cross-user permission checks.

**Retrieval** (27 answerable cases, top 5):

| Retriever | Recall@1 | Recall@3 | Recall@5 | MRR |
|---|---|---|---|---|
| vector (pgvector) | 96% | 100% | 100% | 0.98 |
| keyword (full-text) | 70% | 89% | 89% | 0.80 |
| **hybrid (RRF)** | 93% | 96% | **100%** | 0.95 |

**Access control:** 0 forbidden documents retrieved.

What the evals changed:

- **Keyword search used AND semantics**, so natural questions matched nothing → switched to OR-ed terms ranked by `ts_rank_cd`.
- **Candidate count was too large for the corpus.** With 20 candidates per retriever over ~30 chunks, nearly every chunk sat in both lists, so an incidental keyword match ("note" → "Alice's *Notes*") was "found twice" and outranked the true #1. 20 → 10 candidates took hybrid recall@5 from 96% to 100%. (Down-weighting the keyword list, tried first, changed nothing — the eval said so.)
- **RLS initially let a session with no user see shared documents** → caught by an integration test, fixed with a fail-closed policy (`drizzle/0002_rls_require_user.sql`).

Honest read: on this small, clean corpus, `nomic-embed-text` alone already finds everything, so hybrid
doesn't beat vector here — it matches it at recall@5 while adding exact-token matching as insurance for
larger corpora full of IDs and codes. A bigger, messier golden set is the next step to prove (or
disprove) that.

**Answers** are graded on fact accuracy, citing a source that actually contains the answer, and
refusing when the answer isn't available. Run `npm run eval -- --answers --judge` with Groq for the
real numbers; the local 1.5B model gets most facts right but ignores the citation instruction, and the
eval flags every such answer.

## Design decisions

| Decision | Why | Trade-off |
|---|---|---|
| **Row-level security** instead of `WHERE owner_id = ?` in app code | One rule, enforced by Postgres for every query — the document list, retrieval for the LLM, deletes. A forgotten filter can't leak data. | Must set the user per transaction (`set_config(..., true)`), and the app must connect as a non-superuser role (superusers bypass RLS). |
| **Transaction-local user setting** | `set_config('app.user_id', id, true)` resets at commit, so pooled connections never carry one user's identity into another request. Tested. | Every RLS query runs inside a transaction. |
| **Hybrid search + RRF** | Vectors catch paraphrases; full-text catches exact tokens. RRF merges by rank, so incompatible score scales don't matter. | Two queries per search (~30 ms total locally). |
| **Heading-aware chunking** (~1200 chars, 200 overlap) | Chunks never straddle sections and carry their heading path for citations. | Character budget, not tokens — simpler, slightly less precise. |
| **nomic task prefixes** (`search_document:` / `search_query:`) | The model is trained with them; omitting them silently hurts retrieval. | Ties `embed.ts` to this model family. |
| **Cache key = question + retrieved chunk ids + model** | Permission-safe (different access → different chunks → different key) and self-invalidating when documents change. Only the LLM call is skipped. | Only standalone questions are cached; follow-ups depend on history. |
| **Stateless JWT sessions** in an httpOnly, SameSite=Lax cookie | No session table; the proxy can check it cheaply. Real checks happen next to the data (`requireUser()`), per the Next.js auth guide. | Can't revoke a single session before expiry (7 days) without a denylist. |
| **scrypt** from `node:crypto` for passwords | Memory-hard, salted, no native dependency. Constant-time compare; same work for unknown emails. | — |
| **Provider-agnostic LLM layer** | Groq (free, fast) in production, Ollama fully offline — one env var. | Small local models follow citation rules poorly. |
| **Everything in Postgres** | Documents, vectors, full-text and access control in one transactional store. | A dedicated vector DB scales further past tens of millions of vectors. |

## Project layout

```
src/
  app/                 login, chat (/), documents (upload, list, delete), api/chat (streaming)
  db/                  Drizzle schema, withUser() for RLS, integration tests
  lib/                 chunk, embed, search (hybrid + RRF), ingest, extract (PDF), prompt,
                       answer (+ LLM judge), cache (Redis), session, users, eval metrics
  proxy.ts             optimistic redirect to /login (not the security boundary)
drizzle/               SQL migrations, incl. row-level security policies
evals/                 golden set + latest report
scripts/               seed, ingest, search, eval CLIs
```

## Roadmap

- [x] Postgres + pgvector schema, HNSW + GIN indexes, migrations
- [x] Heading-aware chunking, idempotent ingestion, PDF/Markdown upload
- [x] Hybrid retrieval with RRF
- [x] Auth + Postgres row-level security, tested
- [x] Streaming chat with inline citations
- [x] Redis answer cache
- [x] Eval suite + CI gate (access leaks, retrieval recall)
- [ ] Deploy (Vercel + Neon + Upstash) and demo GIF
- [ ] Larger golden set; query rewriting for follow-up questions
