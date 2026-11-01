import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session-token";

/**
 * Optimistic routing only: bounce signed-out visitors to /login and signed-in ones away from it.
 * This is NOT the security boundary — every page, action and API route re-checks the session,
 * and Postgres row-level security enforces document access underneath that.
 */
export async function proxy(req: NextRequest) {
  const session = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  const isLogin = req.nextUrl.pathname === "/login";

  if (!session && !isLogin) return NextResponse.redirect(new URL("/login", req.url));
  if (session && isLogin) return NextResponse.redirect(new URL("/", req.url));
  return NextResponse.next();
}

export const config = {
  // Pages only: API routes return 401 themselves, and static assets need no session.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
