/**
 * Integration test: the app's database role cannot read password hashes, yet login still works.
 * Needs the docker-compose database, migrated and seeded:  npm run db:up && npm run db:migrate && npm run seed
 */
import "dotenv/config";
import { afterAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { closeDb, getDb } from "@/db";
import { users } from "@/db/schema";
import { authenticate, findUserByEmail, upsertUser } from "@/lib/users";

const DEMO_PASSWORD = "docmind-demo"; // from scripts/seed.ts (importing it would run the seed)
const TEMP_EMAIL = "users-int-test@lumen.dev";

afterAll(async () => {
  await getDb().delete(users).where(eq(users.email, TEMP_EMAIL));
  await closeDb();
});

/** The Postgres error behind a failed query (Drizzle wraps it as `cause`). */
async function pgError(query: PromiseLike<unknown>) {
  const e = (await Promise.resolve(query).then(() => null, (err: unknown) => err)) as
    | { code?: string; message?: string; cause?: { code?: string; message?: string } }
    | null;
  return e?.cause ?? e;
}

describe("password hashes", () => {
  it("the app role cannot select password_hash, directly or via select *", async () => {
    for (const query of [
      getDb().execute(sql`select password_hash from users`),
      getDb().execute(sql`select * from users`),
      getDb().select().from(users),
    ]) {
      const err = await pgError(query);
      expect(err?.code).toBe("42501"); // insufficient_privilege
      expect(err?.message).toMatch(/permission denied/);
    }
  });

  it("the app role can still read the non-secret columns", async () => {
    const alice = await findUserByEmail("alice@lumen.dev");
    expect(alice).toMatchObject({ email: "alice@lumen.dev", name: expect.any(String) });
    expect(alice).not.toHaveProperty("passwordHash");
  });

  it("the login helpers never hand back the stored hash", async () => {
    const [params] = await getDb().execute<Record<string, unknown>>(
      sql`select * from app_password_params('alice@lumen.dev')`,
    );
    expect(Object.keys(params).sort()).toEqual(["key_length", "salt"]);
    expect(String(params.salt)).not.toContain("$");
    // A wrong candidate gets nothing back, not an error message with the real hash in it.
    const rows = await getDb().execute(sql`select * from app_check_password('alice@lumen.dev', 'scrypt$x$y')`);
    expect(rows).toHaveLength(0);
  });

  it("login still works: right password in, wrong password and unknown email out", async () => {
    const alice = await authenticate("Alice@Lumen.dev ", DEMO_PASSWORD);
    expect(alice).toMatchObject({ email: "alice@lumen.dev" });
    expect(alice).not.toHaveProperty("passwordHash");
    expect(await authenticate("alice@lumen.dev", "wrong-password")).toBeNull();
    expect(await authenticate("nobody@lumen.dev", DEMO_PASSWORD)).toBeNull();
  });

  it("the seed path can still create and update users (write-only hash)", async () => {
    const created = await upsertUser(TEMP_EMAIL, "Temp", "first-password");
    expect(created).toEqual({ id: expect.any(String), email: TEMP_EMAIL, name: "Temp" });
    const updated = await upsertUser(TEMP_EMAIL, "Temp 2", "second-password");
    expect(updated.id).toBe(created.id);
    expect(await authenticate(TEMP_EMAIL, "first-password")).toBeNull();
    expect(await authenticate(TEMP_EMAIL, "second-password")).toMatchObject({ name: "Temp 2" });
  });
});
