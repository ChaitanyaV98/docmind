import { describe, expect, it } from "vitest";
import { normalizeAnswer } from "./normalize-answer";

describe("normalizeAnswer", () => {
  it("turns lenticular and full-width citation brackets into [n]", () => {
    expect(normalizeAnswer("Capped at ₹6,000【1】 and ₹1,500［2］.")).toBe(
      "Capped at ₹6,000[1] and ₹1,500[2].",
    );
  });

  it("replaces Unicode hyphens so identifiers match exactly", () => {
    expect(normalizeAnswer("Muted with PLAT‑812 (on‐call).")).toBe(
      "Muted with PLAT-812 (on-call).",
    );
  });

  it("leaves ordinary text, en dashes and [n] untouched", () => {
    const s = "Answer in 1–4 sentences [3][4].";
    expect(normalizeAnswer(s)).toBe(s);
  });
});
