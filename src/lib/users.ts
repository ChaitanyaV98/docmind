import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { hashPassword, verifyPassword } from "./password";

export async function findUserByEmail(email: string): Promise<User | null> {
  const [user] = await getDb()
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()));
  return user ?? null;
}

/** Returns the user on success, null on wrong email *or* password (never reveal which). */
export async function authenticate(email: string, password: string): Promise<User | null> {
  const user = await findUserByEmail(email);
  if (!user) {
    // Hash anyway so "unknown email" and "wrong password" take the same time.
    await hashPassword(password);
    return null;
  }
  return (await verifyPassword(password, user.passwordHash)) ? user : null;
}

export async function upsertUser(email: string, name: string, password: string): Promise<User> {
  const passwordHash = await hashPassword(password);
  const [user] = await getDb()
    .insert(users)
    .values({ email: email.toLowerCase(), name, passwordHash })
    .onConflictDoUpdate({ target: users.email, set: { name, passwordHash } })
    .returning();
  return user;
}
