# DocMind

[![CI](https://github.com/ChaitanyaV98/docmind/actions/workflows/ci.yml/badge.svg)](https://github.com/ChaitanyaV98/docmind/actions/workflows/ci.yml)

**Ask questions about your team's documents and get answers that point to exactly where they came from.**

![DocMind demo: a question answered with a citation, its source passage opened, then an exact error-code lookup](docs/demo.gif)

## What is it?

Teams keep knowledge in PDFs, handbooks and notes that nobody has time to search. DocMind lets you
upload those documents and ask questions in plain English, like *"How many days of sick leave do I
get?"* or *"What does error ERR-5310 mean?"*

- **Every answer shows its sources.** Each fact has a numbered citation `[1]`. Click it to see the exact passage it came from.
- **It says when it doesn't know.** If the answer isn't in your documents, it says so instead of making something up.
- **People only see what they're allowed to.** Your private documents stay private, and shared documents are visible to the whole team.
- **Its quality is measured, not guessed.** A test suite checks on every code change that it finds the right passages and never leaks private data.

**Live demo: [docmind-chaitanya.vercel.app](https://docmind-chaitanya.vercel.app)**. Sign in as `alice@lumen.dev` or `bob@lumen.dev`, password `docmind-demo`.

## Results

| What's measured | Result |
|---|---|
| Right passage found in the top 5 results (recall@5) | **100%** (27 questions) |
| Answers correct, with a valid citation (or a correct refusal) | **97%** (30 of 31) |
| Faithfulness to sources, graded by an LLM judge | **4.93 / 5** |
| Private documents leaked to the wrong user | **0** (checked in CI) |
| Repeated question, answered from cache | **~0.6 s** live (vs ~2 s uncached); ~190 ms locally |

## How it works

```
Upload:  file ─► extract text ─► split into sections ─► embed ─► Postgres (pgvector)

Ask:     question ─► search as this user ─► top passages ─► LLM writes the answer with [n] citations
                     (meaning + keywords,                    (served from Redis cache if
                      private docs filtered                   the same question was asked before)
                      by the database itself)
```

1. **Search uses two methods together.** One matches by meaning (*"doctor's note"* finds *"medical certificate"*), the other by exact words (`ERR-5310`). Their rankings are combined with Reciprocal Rank Fusion.
2. **The database enforces access.** Postgres row-level security filters every query by user, so a bug in the app code can't expose someone else's documents to the AI. The app's database role can't read password hashes either: login sends Postgres a candidate hash and Postgres does the comparison.
3. **The AI only answers from what it was given.** It gets the matching passages and must cite them.

## Tech stack

Next.js 16 · TypeScript · PostgreSQL 17 + pgvector · Drizzle ORM · Vercel AI SDK · Groq (gpt-oss-120b) / Ollama ·
Redis · Vitest · GitHub Actions

## Run it locally

You need Docker, Node 24 and [Ollama](https://ollama.com).

```bash
cp .env.example .env            # set AUTH_SECRET (openssl rand -base64 32) and GROQ_API_KEY
ollama pull nomic-embed-text
npm install
npm run db:up                   # Postgres :5434, Redis :6380
npm run db:migrate
npm run seed                    # demo users + sample handbook
npm run dev
```

Sign in as `alice@lumen.dev` or `bob@lumen.dev` (password `docmind-demo`). Both see the shared
handbook, and each has private notes. Ask Bob about "PLAT-812" and he gets nothing, because that note is Alice's.

No Groq key? Set `LLM_PROVIDER=ollama` and run `ollama pull qwen2.5:1.5b` to work fully offline (answers will be lower quality).

| Command | Purpose |
|---|---|
| `npm test` | Unit tests |
| `npm run test:int` | Access-control tests against the real database |
| `npm run eval` | Search quality: meaning vs keyword vs combined |
| `npm run eval -- --answers --judge` | Also grades the answers, citations and refusals |

## Evaluation

`evals/golden.json` holds 31 test questions: reworded questions, exact codes, questions with no
answer in the documents, and checks that one user can't see another's private notes.

| Search method | Recall@1 | Recall@5 | MRR |
|---|---|---|---|
| Meaning only (pgvector) | 96% | 100% | 0.98 |
| Keywords only (full-text) | 70% | 89% | 0.80 |
| **Combined (RRF)** | 93% | **100%** | 0.95 |

These numbers use local Ollama embeddings (`nomic-embed-text`). The live site uses Gemini
(`gemini-embedding-001`, 768 dimensions) because Ollama can't run on serverless. Re-running the eval
against the live database gives combined recall@5 **100%**, MRR **0.97** and **0** leaks; see
[`evals/report-gemini.md`](evals/report-gemini.md).

**Bugs the evals caught:**
- Keyword search required *every* word to match, so normal questions found nothing. It now matches any word and ranks by relevance.
- Too many search candidates on a small document set let a weak keyword match outrank the right answer. Fewer candidates fixed it (96% → 100%).
- The model wrote citations as `【1】` and IDs with Unicode hyphens (`PLAT‑812`), so 11 correct answers failed the checks and showed no citation chips in the UI. Normalising the output took answers from 65% to 97%.
- A logged-out request could see shared documents. An integration test caught this, and the database rule now fails closed.

**Answers** (Groq `openai/gpt-oss-120b`, graded on facts, citations and refusals):

| Question type | Passed |
|---|---|
| Reworded questions | 11/12 |
| Direct questions | 8/8 |
| Exact codes and commands | 5/5 |
| Not in the documents (must refuse) | 2/2 |
| Private notes and permission checks | 4/4 |

The one failure is a useful catch: asked about annual leave, the model added up three numbers into
a "46 days total" that no document states. Every fact was right, but the total was invented, and
the LLM judge flagged it as unsupported.

On this small document set, meaning-based search alone already finds everything. The keyword half
is insurance for larger sets full of IDs and error codes, which a bigger test set will need to prove.

## Key design decisions

| Decision | Why |
|---|---|
| Access rules in Postgres (row-level security) | One rule covers every query, including the AI's searches. A forgotten filter in app code can't leak data. |
| Combined search with rank fusion | Meaning search misses exact codes; keyword search misses paraphrases. Together they cover both. |
| Cache key = question + passages found + model | Users with different access get different passages, so they never share a cached answer, and the cache refreshes itself when documents change. |
| Everything in Postgres | Documents, vectors, text search and permissions live in one database, kept consistent by transactions. |
| Switchable AI provider | Groq (free) for the live app, Ollama to work fully offline, chosen with one setting. |

## Project layout

```
src/app/     pages: login, chat, documents, streaming chat API
src/db/      database schema, per-user access helper, access tests
src/lib/     chunking, embeddings, search, ingestion, prompts, cache, sessions
drizzle/     SQL migrations, including the access rules
evals/       test questions and latest report
scripts/     seed, ingest, search and eval command-line tools
```

## Roadmap

- [x] Upload, search, cited answers, access control, cache, evals in CI
- [x] Deploy (Vercel + Neon + Upstash)
- [x] Demo GIF
- [ ] Larger test set; better handling of follow-up questions

## Deployment

| Piece | Service (free tier) |
|---|---|
| App | Vercel, functions pinned to Singapore (`vercel.json`) next to the database |
| Postgres + pgvector | Neon. The app connects as `docmind_app`, which cannot bypass row-level security |
| Answer cache | Upstash Redis |
| Embeddings / answers | Gemini / Groq |

To deploy your own: create the `docmind_app` role and the `vector` extension (see `docker/init.sql`),
run `npm run db:migrate` and `npm run seed` with `EMBED_PROVIDER=gemini`, then set `DATABASE_URL`,
`REDIS_URL`, `AUTH_SECRET`, `EMBED_PROVIDER=gemini`, `GEMINI_API_KEY`, `LLM_PROVIDER=groq` and
`GROQ_API_KEY` in Vercel.

Free-tier limits: uploads over ~4.5 MB are rejected by Vercel, and the first request after the
database has been idle takes about a second longer while Neon wakes up.

## License

MIT
