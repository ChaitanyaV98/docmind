"use server";

import { eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { withUser } from "@/db";
import { documents } from "@/db/schema";
import { extractFromFile } from "@/lib/extract";
import { ingestDocument } from "@/lib/ingest";
import { requireUser } from "@/lib/session";

export interface UploadState {
  ok?: string;
  error?: string;
}

export async function uploadDocument(_prev: UploadState, formData: FormData): Promise<UploadState> {
  const user = await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a file to upload." };

  try {
    const { title, text } = await extractFromFile(file);
    const res = await ingestDocument(user.userId, {
      title,
      text,
      source: file.name,
      shared: formData.get("shared") === "on",
    });
    refresh();
    return res.skipped
      ? { ok: `"${title}" is already in your library.` }
      : { ok: `Added "${title}" — ${res.chunkCount} chunks indexed.` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Upload failed." };
  }
}

export async function deleteDocument(formData: FormData) {
  const user = await requireUser();
  const id = String(formData.get("id") ?? "");
  // No owner check needed here: row-level security only lets the owner delete,
  // so deleting someone else's (even shared) document is a silent no-op.
  await withUser(user.userId, (tx) => tx.delete(documents).where(eq(documents.id, id)));
  refresh();
}
