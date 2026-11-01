/**
 * Ingest markdown/text files from the command line, as a given user.
 *   npm run ingest -- --as alice@lumen.dev [--shared] docs/samples/*.md
 */
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { parseArgs } from "node:util";
import { closeDb } from "@/db";
import { ingestDocument } from "@/lib/ingest";
import { findUserByEmail } from "@/lib/users";

function titleFrom(path: string, text: string): string {
  const h1 = /^#\s+(.+)$/m.exec(text);
  return h1?.[1].trim() ?? basename(path, extname(path));
}

async function main() {
  const { values, positionals: files } = parseArgs({
    allowPositionals: true,
    options: { as: { type: "string" }, shared: { type: "boolean", default: false } },
  });
  if (!values.as || files.length === 0) {
    console.error("Usage: npm run ingest -- --as <email> [--shared] <file.md> [more files...]");
    process.exit(1);
  }
  const user = await findUserByEmail(values.as);
  if (!user) throw new Error(`No user ${values.as} — run npm run seed first`);

  for (const file of files) {
    const text = await readFile(file, "utf8");
    const started = performance.now();
    const res = await ingestDocument(user.id, {
      title: titleFrom(file, text),
      source: file,
      text,
      shared: values.shared,
    });
    const ms = Math.round(performance.now() - started);
    console.log(
      res.skipped
        ? `↷ ${file} — already ingested, skipped`
        : `✓ ${file} — ${res.chunkCount} chunks in ${ms} ms`,
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(closeDb);
