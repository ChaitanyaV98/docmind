import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in · DocMind" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">DocMind</h1>
        <p className="mt-1 mb-8 text-sm text-muted">
          Answers from your team&apos;s documents, with sources.
        </p>
        <LoginForm />
        <div className="mt-8 rounded-lg border border-line p-3 text-xs text-muted">
          <p className="font-medium text-foreground">Demo accounts</p>
          <p className="mt-1">
            <code>alice@lumen.dev</code> or <code>bob@lumen.dev</code>, password{" "}
            <code>docmind-demo</code>. Each sees the shared handbook plus their own private notes.
          </p>
        </div>
      </div>
    </main>
  );
}
