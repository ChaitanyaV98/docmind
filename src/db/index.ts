import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type DB = PostgresJsDatabase<typeof schema>;
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0];

// Cache across Next.js hot reloads so dev mode doesn't open a new pool on every edit.
const globalForDb = globalThis as unknown as { db?: DB; client?: postgres.Sql };

/** Lazily connect, so importing this module never needs DATABASE_URL (e.g. in unit tests). */
export function getDb(): DB {
  if (!globalForDb.db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set — copy .env.example to .env");
    globalForDb.client = postgres(url, { max: 10 });
    globalForDb.db = drizzle(globalForDb.client, { schema });
  }
  return globalForDb.db;
}

/**
 * Run `fn` inside a transaction where Postgres row-level security sees `userId` as the
 * current user. Every query that touches documents or chunks must go through here —
 * without it, RLS returns zero rows (fail closed), never someone else's data.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** For CLI scripts: close the pool so the process can exit. */
export async function closeDb() {
  await globalForDb.client?.end();
  globalForDb.client = undefined;
  globalForDb.db = undefined;
}
