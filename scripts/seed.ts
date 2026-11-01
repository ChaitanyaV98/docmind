/**
 * Demo data: two users, the sample handbook shared with the whole team, and one private
 * document per user — so you can log in as each and watch row-level security at work.
 *   npm run seed
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { closeDb } from "@/db";
import { ingestDocument } from "@/lib/ingest";
import { upsertUser } from "@/lib/users";

export const DEMO_PASSWORD = "docmind-demo";

const SHARED = ["docs/samples/leave-policy.md", "docs/samples/expense-policy.md", "docs/samples/oncall-runbook.md"];

async function ingestFile(userId: string, path: string, shared: boolean) {
  const text = await readFile(path, "utf8");
  const title = /^#\s+(.+)$/m.exec(text)?.[1].trim() ?? path;
  const res = await ingestDocument(userId, { title, source: path, text, shared });
  console.log(`  ${res.skipped ? "↷" : "✓"} ${title} ${shared ? "(team)" : "(private)"}${res.skipped ? " — already there" : ` — ${res.chunkCount} chunks`}`);
}

async function main() {
  const alice = await upsertUser("alice@lumen.dev", "Alice (Platform)", DEMO_PASSWORD);
  const bob = await upsertUser("bob@lumen.dev", "Bob (Finance)", DEMO_PASSWORD);
  console.log(`users: ${alice.email}, ${bob.email}  (password: ${DEMO_PASSWORD})`);

  console.log("alice:");
  for (const path of SHARED) await ingestFile(alice.id, path, true);
  await ingestFile(alice.id, "docs/samples/private/alice-oncall-notes.md", false);

  console.log("bob:");
  await ingestFile(bob.id, "docs/samples/private/bob-budget-review.md", false);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
