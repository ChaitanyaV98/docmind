/**
 * DocMind eval suite.
 *
 *   npm run eval                      retrieval only (no LLM): vector vs keyword vs hybrid
 *   npm run eval -- --answers         + generate answers: fact accuracy, citations, refusals
 *   npm run eval -- --answers --judge + LLM-as-judge faithfulness (best with LLM_PROVIDER=groq)
 *   npm run eval -- --min-recall 0.9  exit 1 if hybrid recall@5 drops below 0.9 (used in CI)
 *
 * Writes evals/report.md (human-readable) and evals/results.json (machine-readable).
 */
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { closeDb } from "@/db";
import { answerQuestion, judgeFaithfulness } from "@/lib/answer";
import { embeddingModelId } from "@/lib/embed";
import { firstRelevantRank, missingFacts, scoreRetrieval, type RetrievalScores } from "@/lib/eval-metrics";
import { getChatModel } from "@/lib/llm";
import { citedSourceNumbers, NOT_FOUND_ANSWER } from "@/lib/prompt";
import { citationLabel, hybridSearch, type SearchMode } from "@/lib/search";
import { findUserByEmail } from "@/lib/users";

interface Case {
  id: string;
  user: "alice" | "bob";
  kind: string;
  question: string;
  expected: string[];
  facts: string[];
  forbidden?: string;
}

const MODES: SearchMode[] = ["vector", "keyword", "hybrid"];
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { values } = parseArgs({
    options: {
      answers: { type: "boolean", default: false },
      judge: { type: "boolean", default: false },
      "min-recall": { type: "string" },
      // Groq's free tier allows ~30 requests/minute.
      delay: { type: "string", default: process.env.LLM_PROVIDER === "groq" ? "2100" : "0" },
    },
  });
  const delayMs = Number(values.delay);

  const { cases } = JSON.parse(await readFile("evals/golden.json", "utf8")) as { cases: Case[] };
  const userIds: Record<string, string> = {};
  for (const name of ["alice", "bob"]) {
    const u = await findUserByEmail(`${name}@lumen.dev`);
    if (!u) throw new Error("Demo users missing — run npm run seed first");
    userIds[name] = u.id;
  }

  // ---------- Retrieval ----------
  const answerable = cases.filter((c) => c.expected.length > 0);
  const retrieval: Record<string, RetrievalScores & { latencyMs: number }> = {};
  const hybridMisses: string[] = [];
  let leaks = 0;

  for (const mode of MODES) {
    const ranks: (number | null)[] = [];
    let totalMs = 0;
    for (const c of answerable) {
      const t = performance.now();
      const hits = await hybridSearch(userIds[c.user], c.question, { mode, limit: 5 });
      totalMs += performance.now() - t;
      const rank = firstRelevantRank(hits.map((h) => citationLabel(h.documentTitle, h.heading)), c.expected);
      ranks.push(rank);
      if (mode === "hybrid" && rank === null) hybridMisses.push(c.id);
    }
    retrieval[mode] = { ...scoreRetrieval(ranks), latencyMs: totalMs / answerable.length };
  }

  // Row-level security: a forbidden document must never appear in any user's results.
  for (const c of cases.filter((c) => c.forbidden)) {
    const hits = await hybridSearch(userIds[c.user], c.question, { limit: 20 });
    if (hits.some((h) => h.documentTitle === c.forbidden)) leaks++;
  }

  // ---------- Answers ----------
  type AnswerRow = { id: string; kind: string; ok: boolean; problems: string[]; faithfulness?: number; answer: string };
  const answers: AnswerRow[] = [];
  const modelId = values.answers ? getChatModel().id : null;

  if (values.answers) {
    for (const c of cases) {
      const { text, sources } = await answerQuestion(userIds[c.user], c.question);
      const problems: string[] = [];
      const refused = text.includes(NOT_FOUND_ANSWER);

      if (c.expected.length === 0) {
        if (!refused) problems.push("should have refused (answer is not in the user's documents)");
      } else {
        if (refused) problems.push("refused although the answer is in the documents");
        const missing = missingFacts(text, c.facts);
        if (missing.length) problems.push(`missing facts: ${missing.join(", ")}`);
        const cited = citedSourceNumbers(text);
        if (cited.length === 0) problems.push("no citations");
        const citedLabels = cited.map((n) => sources.find((s) => s.n === n)?.label ?? "?");
        if (cited.length && firstRelevantRank(citedLabels, c.expected) === null) {
          problems.push("cites only sources that don't contain the answer");
        }
      }

      let faithfulness: number | undefined;
      if (values.judge && !refused) {
        await sleep(delayMs);
        faithfulness = (await judgeFaithfulness(text, sources)).score;
        if (faithfulness < 4) problems.push(`judge: faithfulness ${faithfulness}/5`);
      }

      answers.push({ id: c.id, kind: c.kind, ok: problems.length === 0, problems, faithfulness, answer: text });
      process.stdout.write(problems.length ? "✗" : "✓");
      await sleep(delayMs);
    }
    process.stdout.write("\n");
  }

  // ---------- Report ----------
  const lines: string[] = [];
  lines.push(`# DocMind eval report`, ``);
  lines.push(`${cases.length} golden cases · ${answerable.length} answerable · embeddings: ${embeddingModelId()}${modelId ? ` · answers: ${modelId}` : ""}`, ``);
  lines.push(`## Retrieval (top 5)`, ``);
  lines.push(`| Retriever | Recall@1 | Recall@3 | Recall@5 | MRR | Avg latency |`);
  lines.push(`|---|---|---|---|---|---|`);
  for (const mode of MODES) {
    const r = retrieval[mode];
    lines.push(`| ${mode === "hybrid" ? "**hybrid (RRF)**" : mode} | ${pct(r.recallAt1)} | ${pct(r.recallAt3)} | ${pct(r.recallAt5)} | ${r.mrr.toFixed(2)} | ${Math.round(r.latencyMs)} ms |`);
  }
  lines.push(``, `Hybrid misses: ${hybridMisses.length ? hybridMisses.join(", ") : "none"}`);
  lines.push(``, `## Access control`, ``, `Forbidden documents retrieved: **${leaks}** (must be 0)`);

  if (answers.length) {
    const passed = answers.filter((a) => a.ok).length;
    const byKind = new Map<string, { ok: number; n: number }>();
    for (const a of answers) {
      const k = byKind.get(a.kind) ?? { ok: 0, n: 0 };
      k.n++;
      if (a.ok) k.ok++;
      byKind.set(a.kind, k);
    }
    lines.push(``, `## Answers`, ``, `Passed **${passed}/${answers.length}** (${pct(passed / answers.length)})`, ``);
    lines.push(`| Kind | Passed |`, `|---|---|`);
    for (const [kind, k] of byKind) lines.push(`| ${kind} | ${k.ok}/${k.n} |`);
    const judged = answers.filter((a) => a.faithfulness !== undefined);
    if (judged.length) {
      const avg = judged.reduce((s, a) => s + a.faithfulness!, 0) / judged.length;
      lines.push(``, `Average faithfulness (LLM judge, 1–5): **${avg.toFixed(2)}** over ${judged.length} answers`);
    }
    const failed = answers.filter((a) => !a.ok);
    if (failed.length) {
      lines.push(``, `### Failures`, ``);
      for (const f of failed) lines.push(`- **${f.id}** — ${f.problems.join("; ")}  \n  > ${f.answer.replace(/\n+/g, " ").slice(0, 240)}`);
    }
  }

  const report = lines.join("\n") + "\n";
  await writeFile("evals/report.md", report);
  await writeFile("evals/results.json", JSON.stringify({ retrieval, leaks, hybridMisses, answers }, null, 2) + "\n");
  console.log("\n" + report);

  const minRecall = values["min-recall"] ? Number(values["min-recall"]) : null;
  if (leaks > 0) {
    console.error("✗ access-control leak detected");
    process.exitCode = 1;
  }
  if (minRecall !== null && retrieval.hybrid.recallAt5 < minRecall) {
    console.error(`✗ hybrid recall@5 ${pct(retrieval.hybrid.recallAt5)} is below the ${pct(minRecall)} threshold`);
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
