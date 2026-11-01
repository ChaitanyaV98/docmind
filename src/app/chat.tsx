"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Fragment, useEffect, useRef, useState } from "react";
import { messageText, type ChatMessage } from "@/lib/chat-types";
import type { Source } from "@/lib/prompt";

const SUGGESTIONS = [
  "How many days of annual leave do I get, and can I carry them over?",
  "What's the hotel limit in metro cities?",
  "What should I do about ERR-4021?",
  "Is there an allowance for my home office?",
];

export function Chat({ firstName }: { firstName: string }) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, stop, error } = useChat<ChatMessage>({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });
  const busy = status === "submitted" || status === "streaming";
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  function ask(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    sendMessage({ text: q });
    setInput("");
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4">
      <div className="flex-1 space-y-8 py-8">
        {messages.length === 0 && (
          <div className="pt-10">
            <h1 className="text-2xl font-semibold tracking-tight">Hi {firstName} — ask your documents.</h1>
            <p className="mt-2 text-sm text-muted">
              Answers come only from documents you can access, with a citation for every fact.
            </p>
            <div className="mt-6 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-lg border border-line p-3 text-left text-sm transition hover:border-accent hover:bg-panel"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) =>
          m.role === "user" ? (
            <div key={m.id} className="flex justify-end">
              <p className="max-w-[85%] rounded-2xl bg-panel px-4 py-2 text-sm">{messageText(m)}</p>
            </div>
          ) : (
            <AssistantMessage key={m.id} message={m} streaming={busy && m.id === messages.at(-1)?.id} />
          ),
        )}

        {status === "submitted" && <p className="animate-pulse text-sm text-muted">Searching your documents…</p>}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            Something went wrong: {error.message}
          </p>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(input);
        }}
        className="sticky bottom-0 flex gap-2 border-t border-line bg-background py-4"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question about your documents…"
          aria-label="Question"
          maxLength={2000}
          className="input"
        />
        {busy ? (
          <button type="button" onClick={stop} className="btn-primary">
            Stop
          </button>
        ) : (
          <button type="submit" disabled={!input.trim()} className="btn-primary">
            Ask
          </button>
        )}
      </form>
    </main>
  );
}

function AssistantMessage({ message, streaming }: { message: ChatMessage; streaming: boolean }) {
  const [active, setActive] = useState<number | null>(null);
  const sources = message.metadata?.sources ?? [];
  const text = messageText(message);
  const cited = new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])));
  const citedSources = sources.filter((s) => cited.has(s.n));

  return (
    <div className="space-y-3">
      <p className="text-sm leading-7 whitespace-pre-wrap">
        <AnswerWithCitations text={text} sources={sources} onCite={setActive} />
        {streaming && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-muted align-middle" />}
      </p>

      {!streaming && citedSources.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">
            Sources
            {message.metadata?.cached && (
              <span className="ml-2 rounded bg-panel px-1.5 py-0.5 normal-case">⚡ cached answer</span>
            )}
          </p>
          {citedSources.map((s) => (
            <SourceCard key={s.chunkId} source={s} highlighted={active === s.n} />
          ))}
        </div>
      )}
    </div>
  );
}

function AnswerWithCitations({
  text,
  sources,
  onCite,
}: {
  text: string;
  sources: Source[];
  onCite: (n: number) => void;
}) {
  return (
    <>
      {text.split(/(\[\d+\])/g).map((part, i) => {
        const m = /^\[(\d+)\]$/.exec(part);
        const source = m && sources.find((s) => s.n === Number(m[1]));
        if (!source) return <Fragment key={i}>{part}</Fragment>;
        return (
          <button
            key={i}
            type="button"
            onClick={() => {
              onCite(source.n);
              document.getElementById(`src-${source.chunkId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
            }}
            title={source.label}
            className="mx-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent/15 px-1 align-baseline text-xs font-medium text-accent hover:bg-accent/25"
          >
            {source.n}
          </button>
        );
      })}
    </>
  );
}

function SourceCard({ source, highlighted }: { source: Source; highlighted: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div
      id={`src-${source.chunkId}`}
      className={`rounded-lg border p-3 text-sm transition ${highlighted ? "border-accent bg-accent/5" : "border-line"}`}
    >
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-2 text-left">
        <span className="mt-0.5 inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent/15 px-1 text-xs font-medium text-accent">
          {source.n}
        </span>
        <span className="flex-1 font-medium">{source.label}</span>
        <span className="text-xs text-muted">{open ? "Hide" : "Show"} excerpt</span>
      </button>
      {open && <p className="mt-2 border-l-2 border-line pl-3 text-muted whitespace-pre-wrap">{source.excerpt}</p>}
    </div>
  );
}
