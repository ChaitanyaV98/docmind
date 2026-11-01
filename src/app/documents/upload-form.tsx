"use client";

import { useActionState, useRef } from "react";
import { uploadDocument, type UploadState } from "./actions";

export function UploadForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<UploadState, FormData>(async (prev, fd) => {
    const res = await uploadDocument(prev, fd);
    if (res.ok) formRef.current?.reset();
    return res;
  }, {});

  return (
    <form ref={formRef} action={action} className="rounded-lg border border-dashed border-line p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <input
          name="file"
          type="file"
          accept=".pdf,.md,.markdown,.txt"
          required
          aria-label="Document file"
          className="flex-1 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-panel file:px-3 file:py-1.5 file:text-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input name="shared" type="checkbox" className="accent-[var(--accent)]" />
          Share with team
        </label>
        <button type="submit" disabled={pending} className="btn-primary">
          {pending ? "Indexing…" : "Upload"}
        </button>
      </div>
      <p className="mt-2 text-xs text-muted">PDF, Markdown or text · up to 8 MB · private unless shared</p>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
          {state.error}
        </p>
      )}
      {state.ok && <p className="mt-2 text-sm text-green-700 dark:text-green-400">{state.ok}</p>}
    </form>
  );
}
