/**
 * Try hybrid retrieval from the command line, as a given user.
 *   npm run search -- --as alice@lumen.dev "how many days of leave do I get?"
 *   npm run search -- --as bob@lumen.dev --mode vector "ERR-5310"
 */
import "dotenv/config";
import { parseArgs } from "node:util";
import { closeDb } from "@/db";
import { citationLabel, hybridSearch, type SearchMode } from "@/lib/search";
import { findUserByEmail } from "@/lib/users";

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { as: { type: "string" }, mode: { type: "string", default: "hybrid" } },
  });
  const query = positionals.join(" ").trim();
  if (!values.as || !query) {
    console.error('Usage: npm run search -- --as <email> [--mode hybrid|vector|keyword] "your question"');
    process.exit(1);
  }
  const user = await findUserByEmail(values.as);
  if (!user) throw new Error(`No user ${values.as} — run npm run seed first`);

  const started = performance.now();
  const hits = await hybridSearch(user.id, query, { mode: values.mode as SearchMode });
  const ms = Math.round(performance.now() - started);

  console.log(`\n"${query}" as ${user.email} — ${hits.length} results in ${ms} ms\n`);
  hits.forEach((h, i) => {
    const [vec, kw] = h.ranks.map((r) => (r === null ? "–" : `#${r}`));
    const where = citationLabel(h.documentTitle, h.heading);
    console.log(`${i + 1}. ${where}   [rrf ${h.score.toFixed(4)} · vector ${vec} · keyword ${kw}]`);
    console.log(`   ${h.content.slice(0, 220).replace(/\s+/g, " ")}…\n`);
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
