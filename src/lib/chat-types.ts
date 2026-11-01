import type { UIMessage } from "ai";
import type { Source } from "./prompt";

/** Metadata attached to each assistant message (sent on the stream's `start` part). */
export interface ChatMeta {
  sources?: Source[];
  cached?: boolean;
  model?: string;
}

export type ChatMessage = UIMessage<ChatMeta>;

export function messageText(m: Pick<ChatMessage, "parts">): string {
  return m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
}
