import { randomBytes, scrypt as scryptCb } from "node:crypto";
import { promisify } from "node:util";

/**
 * Password hashing with scrypt from Node's standard library — memory-hard, salted,
 * no native dependency. Stored as `scrypt$<salt>$<hash>` (both base64).
 *
 * The app never reads stored hashes back (its database role can't). To check a password it asks
 * Postgres for the salt, re-hashes here, and lets Postgres compare (see users.ts).
 */
const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  return hashWithSalt(password, randomBytes(16).toString("base64"), KEY_LENGTH);
}

/** The stored form of `password` under an existing salt, to compare against a stored hash. */
export async function hashWithSalt(password: string, saltB64: string, keyLength: number): Promise<string> {
  const hash = await scrypt(password, Buffer.from(saltB64, "base64"), keyLength);
  return `scrypt$${saltB64}$${hash.toString("base64")}`;
}
