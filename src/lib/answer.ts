import { generateText, Output } from "ai";
import { z } from "zod";
import { getChatModel } from "./llm";
import { ANSWER_INSTRUCTIONS, buildGroundedPrompt, toSources, type Source } from "./prompt";
import { normalizeAnswer } from "./normalize-answer";
import { hybridSearch } from "./search";

/**
 * Non-streaming question → answer, using exactly the same retrieval and prompt as the chat route.
 * The eval suite uses this, so what it measures is what users get.
 */
export async function answerQuestion(
  userId: string,
  question: string,
): Promise<{ text: string; sources: Source[] }> {
  const sources = toSources(await hybridSearch(userId, question, { limit: 6 }));
  const { text } = await generateText({
    model: getChatModel().model,
    instructions: ANSWER_INSTRUCTIONS,
    prompt: buildGroundedPrompt(question, sources),
    temperature: 0,
  });
  return { text: normalizeAnswer(text).trim(), sources };
}

const Judgement = z.object({
  score: z.number().int().min(1).max(5),
  unsupportedClaims: z.array(z.string()),
});
export type Judgement = z.infer<typeof Judgement>;

/**
 * LLM-as-judge for faithfulness: is every claim in the answer supported by the sources?
 * 5 = fully supported, 1 = mostly invented. This catches hallucination that keyword checks miss.
 */
export async function judgeFaithfulness(answer: string, sources: Source[]): Promise<Judgement> {
  const { output } = await generateText({
    model: getChatModel().model,
    instructions:
      "You are a strict grader of a retrieval-augmented answer. Judge ONLY whether each claim in the ANSWER is directly supported by the SOURCES — not whether it is true in general. List every claim that is not supported. Score 5 if all claims are supported, 4 if one minor detail is unsupported, 3 if a significant claim is unsupported, 2 if most are unsupported, 1 if the answer contradicts the sources or is invented. An answer saying the information could not be found scores 5 only if the sources indeed lack it.",
    prompt: `SOURCES:\n${sources.map((s) => `[${s.n}] ${s.label}\n${s.excerpt}`).join("\n\n")}\n\nANSWER:\n${answer}`,
    output: Output.object({ schema: Judgement, name: "judgement" }),
    temperature: 0,
  });
  return output;
}
