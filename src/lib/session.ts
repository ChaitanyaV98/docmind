import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  signSession,
  verifySessionToken,
  type SessionPayload,
} from "./session-token";

/**
 * Data-access-layer auth checks (the pattern from the Next.js auth guide).
 * The proxy only does a cheap, optimistic redirect; the *real* check is `requireUser()`,
 * called next to the data in every page, server action and route handler.
 */
export async function createSession(payload: SessionPayload) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await signSession(payload), {
    httpOnly: true, // not readable from JavaScript → not stealable via XSS
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // not sent on cross-site POSTs → CSRF protection for actions
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Memoised per request with React `cache`. */
export const getSession = cache(async (): Promise<SessionPayload | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySessionToken(token);
});

/** For pages and server actions: the signed-in user, or redirect to /login. */
export async function requireUser(): Promise<SessionPayload> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}
