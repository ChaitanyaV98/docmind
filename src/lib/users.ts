import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { hashPassword, hashWithSalt } from "./password";

/**
 * A user as the app may see them. The app's database role cannot read `password_hash`
 * (drizzle/0003_hide_password_hashes.sql): selecting it fails with "permission denied".
 */
export interface UserProfile {
  id: string;
  email: string;
  name: string;
}

const profile = { id: users.id, email: users.email, name: users.name };
const normalize = (email: string) => email.trim().toLowerCase();

export async function findUserByEmail(email: string): Promise<UserProfile | null> {
  const [user] = await getDb().select(profile).from(users).where(eq(users.email, normalize(email)));
  return user ?? null;
}

/**
 * Returns the user on success, null on wrong email *or* password (never reveal which).
 * The stored hash never leaves Postgres: we fetch only its salt, hash the attempt here, and the
 * database compares the two.
 */
export async function authenticate(email: string, password: string): Promise<UserProfile | null> {
  const db = getDb();
  const addr = normalize(email);
  const [params] = await db.execute<{ salt: string; key_length: number }>(
    sql`select salt, key_length from app_password_params(${addr})`,
  );
  if (!params) {
    // Hash anyway so "unknown email" and "wrong password" take the same time.
    await hashPassword(password);
    return null;
  }
  const candidate = await hashWithSalt(password, params.salt, params.key_length);
  const [user] = await db.execute<{ id: string; email: string; name: string }>(
    sql`select id, email, name from app_check_password(${addr}, ${candidate})`,
  );
  return user ? { id: user.id, email: user.email, name: user.name } : null;
}

export async function upsertUser(email: string, name: string, password: string): Promise<UserProfile> {
  const passwordHash = await hashPassword(password);
  const [user] = await getDb()
    .insert(users)
    .values({ email: email.toLowerCase(), name, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { name, passwordHash } })
    .returning(profile);
  return user;
}
