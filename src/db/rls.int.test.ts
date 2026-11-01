/**
 * Integration test: proves Postgres row-level security — not app code — isolates users.
 * Needs the docker-compose database, migrated and seeded:  npm run db:up && npm run db:migrate && npm run seed
 */
import "dotenv/config";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb, withUser } from "@/db";
import { chunks, documents } from "@/db/schema";
import { findUserByEmail } from "@/lib/users";

let alice: string;
let bob: string;

beforeAll(async () => {
  alice = (await findUserByEmail("alice@lumen.dev"))!.id;
  bob = (await findUserByEmail("bob@lumen.dev"))!.id;
});
afterAll(closeDb);

const titles = (userId: string) =>
  withUser(userId, (tx) => tx.select({ title: documents.title }).from(documents)).then((rows) =>
    rows.map((r) => r.title).sort(),
  );

describe("row-level security", () => {
  it("shows each user the shared docs plus only their own private docs", async () => {
    const a = await titles(alice);
    const b = await titles(bob);
    expect(a).toContain("Alice's On-Call Notes");
    expect(a).not.toContain("Bob's Budget Review");
    expect(b).toContain("Bob's Budget Review");
    expect(b).not.toContain("Alice's On-Call Notes");
    for (const shared of ["Leave Policy", "Expense Policy", "On-Call Runbook"]) {
      expect(a).toContain(shared);
      expect(b).toContain(shared);
    }
  });

  it("hides chunks of private documents too, even with no WHERE clause at all", async () => {
    const leaked = await withUser(bob, (tx) =>
      tx
        .select({ id: chunks.id })
        .from(chunks)
        .innerJoin(documents, eq(chunks.documentId, documents.id))
        .where(eq(documents.title, "Alice's On-Call Notes")),
    );
    expect(leaked).toHaveLength(0);
  });

  it("fails closed: with no user set, nothing is visible", async () => {
    const rows = await getDb().select({ id: documents.id }).from(documents);
    expect(rows).toHaveLength(0);
  });

  it("refuses to let a user delete someone else's document", async () => {
    const deleted = await withUser(bob, (tx) =>
      tx.delete(documents).where(eq(documents.title, "Leave Policy")).returning({ id: documents.id }),
    );
    expect(deleted).toHaveLength(0); // shared ≠ writable: only the owner (Alice) may delete it
  });

  it("refuses to let a user create a document owned by someone else", async () => {
    await expect(
      withUser(bob, (tx) =>
        tx.insert(documents).values({ ownerId: alice, title: "forged", source: "x", contentHash: "x" }),
      ),
    ).rejects.toThrow();
  });

  it("does not leak the user setting to the next query on a pooled connection", async () => {
    await titles(alice);
    const [{ setting }] = await getDb().execute<{ setting: string | null }>(
      sql`select current_setting('app.user_id', true) as setting`,
    );
    expect(setting || null).toBeNull();
  });
});
