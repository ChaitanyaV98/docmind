import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
} from "ai";
import { z } from "zod";
import { answerCacheKey, getCachedAnswer, setCachedAnswer } from "@/lib/cache";
import { messageText, type ChatMessage, type ChatMeta } from "@/lib/chat-types";
import { getChatModel } from "@/lib/llm";
import { ANSWER_INSTRUCTIONS, buildGroundedPrompt, toSources } from "@/lib/prompt";
import { hybridSearch } from "@/lib/search";
import { getSession } from "@/lib/session";

export const maxDuration = 60;

const HISTORY_TURNS = 6;
const Body = z.object({ messages: z.array(z.any()).min(1).max(100) });

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Not signed in" }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  const messages = parsed.data.messages as ChatMessage[];

  const last = messages.at(-1);
  const question = last?.role === "user" ? messageText(last).trim() : "";
  if (!question || question.length > 2000) {
    return Response.json({ error: "Ask a question (max 2000 characters)" }, { status: 400 });
  }

  // 1. Retrieve — as this user, under row-level security.
  const hits = await hybridSearch(session.userId, question, { limit: 6 });
  const sources = toSources(hits);
  const { model, id: modelId } = getChatModel();

  // 2. Cache: only for standalone questions. In a longer conversation the answer also depends
  //    on earlier turns, which the key doesn't capture.
  const cacheable = messages.length === 1 && sources.length > 0;
  const cacheKey = answerCacheKey(question, sources.map((s) => s.chunkId), modelId);

  if (cacheable) {
    const cached = await getCachedAnswer(cacheKey);
    if (cached) {
      const meta: ChatMeta = { sources, cached: true, model: modelId };
      const stream = createUIMessageStream<ChatMessage>({
        execute({ writer }) {
          writer.write({ type: "start", messageMetadata: meta });
          writer.write({ type: "text-start", id: "cached" });
          writer.write({ type: "text-delta", id: "cached", delta: cached.text });
          writer.write({ type: "text-end", id: "cached" });
          writer.write({ type: "finish" });
        },
      });
      return createUIMessageStreamResponse({ stream });
    }
  }

  // 3. Generate. Earlier turns go in as normal chat history; the latest question is replaced
  //    by the grounded prompt (numbered sources + question).
  const history = await convertToModelMessages(messages.slice(-HISTORY_TURNS - 1, -1));
  const result = streamText({
    model,
    instructions: ANSWER_INSTRUCTIONS,
    messages: [...history, { role: "user", content: buildGroundedPrompt(question, sources) }],
    temperature: 0, // factual Q&A: same question, same answer
    onEnd: async ({ text }) => {
      if (cacheable && text) await setCachedAnswer(cacheKey, { text });
    },
  });

  const meta: ChatMeta = { sources, cached: false, model: modelId };
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      originalMessages: messages,
      messageMetadata: ({ part }) => (part.type === "start" ? meta : undefined),
    }),
  });
}
