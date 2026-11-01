import Link from "next/link";
import { logout } from "./login/actions";
import { requireUser } from "@/lib/session";

export async function AppHeader() {
  const user = await requireUser();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex h-14 max-w-4xl items-center gap-2 px-4">
        <Link href="/" className="mr-4 font-semibold tracking-tight">
          DocMind
        </Link>
        <nav className="flex gap-1">
          <Link href="/" className="btn-ghost">
            Chat
          </Link>
          <Link href="/documents" className="btn-ghost">
            Documents
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="hidden text-muted sm:inline">{user.name}</span>
          <form action={logout}>
            <button type="submit" className="btn-ghost">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}

export function HeaderFallback() {
  return <div className="h-14 border-b border-line" />;
}
