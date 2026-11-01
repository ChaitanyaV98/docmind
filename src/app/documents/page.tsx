import type { Metadata } from "next";
import { count, desc, eq } from "drizzle-orm";
import { Suspense } from "react";
import { AppHeader, HeaderFallback } from "../app-header";
import { deleteDocument } from "./actions";
import { UploadForm } from "./upload-form";
import { withUser } from "@/db";
import { chunks, documents, users } from "@/db/schema";
import { requireUser } from "@/lib/session";

export const metadata: Metadata = { title: "Documents · DocMind" };

export default function DocumentsPage() {
  return (
    <>
      <Suspense fallback={<HeaderFallback />}>
        <AppHeader />
      </Suspense>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Documents</h1>
        <p className="mt-1 mb-6 text-sm text-muted">
          You can search your own documents and anything shared with the team.
        </p>
        <UploadForm />
        <Suspense fallback={<p className="mt-6 text-sm text-muted">Loading…</p>}>
          <DocumentList />
        </Suspense>
      </main>
    </>
  );
}

async function DocumentList() {
  const user = await requireUser();
  // Same row-level security as retrieval: this list is exactly what chat can search.
  const rows = await withUser(user.userId, (tx) =>
    tx
      .select({
        id: documents.id,
        title: documents.title,
        source: documents.source,
        shared: documents.shared,
        ownerId: documents.ownerId,
        ownerName: users.name,
        createdAt: documents.createdAt,
        chunkCount: count(chunks.id),
      })
      .from(documents)
      .innerJoin(users, eq(users.id, documents.ownerId))
      .leftJoin(chunks, eq(chunks.documentId, documents.id))
      .groupBy(documents.id, users.name)
      .orderBy(desc(documents.createdAt)),
  );

  if (rows.length === 0) return <p className="mt-6 text-sm text-muted">No documents yet — upload one above.</p>;

  return (
    <ul className="mt-6 divide-y divide-line rounded-lg border border-line">
      {rows.map((d) => {
        const mine = d.ownerId === user.userId;
        return (
          <li key={d.id} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.title}</p>
              <p className="text-xs text-muted">
                {d.chunkCount} chunks · {mine ? "you" : d.ownerName} ·{" "}
                {d.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>
            <span
              className={`rounded px-2 py-0.5 text-xs ${d.shared ? "bg-accent/15 text-accent" : "bg-panel text-muted"}`}
            >
              {d.shared ? "Team" : "Private"}
            </span>
            {mine && (
              <form action={deleteDocument}>
                <input type="hidden" name="id" value={d.id} />
                <button type="submit" className="btn-ghost" aria-label={`Delete ${d.title}`}>
                  Delete
                </button>
              </form>
            )}
          </li>
        );
      })}
    </ul>
  );
}
