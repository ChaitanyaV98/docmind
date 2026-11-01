import { describe, expect, it } from "vitest";
import { firstRelevantRank, labelMatches, missingFacts, scoreRetrieval } from "./eval-metrics";
import { citedSourceNumbers } from "./prompt";

describe("labelMatches", () => {
  it("matches the section itself and its sub-sections only", () => {
    expect(labelMatches("Expense Policy › Travel", "Expense Policy › Travel")).toBe(true);
    expect(labelMatches("Expense Policy › Travel › Hotels", "Expense Policy › Travel")).toBe(true);
    expect(labelMatches("Expense Policy › Travel Budget", "Expense Policy › Travel")).toBe(false);
    expect(labelMatches("Expense Policy", "Expense Policy › Travel")).toBe(false);
  });
});

describe("firstRelevantRank", () => {
  it("returns the 1-based rank of the first hit, or null", () => {
    expect(firstRelevantRank(["A", "B › x", "C"], ["B"])).toBe(2);
    expect(firstRelevantRank(["A", "C"], ["B"])).toBeNull();
  });
});

describe("scoreRetrieval", () => {
  it("computes recall@k and MRR", () => {
    const s = scoreRetrieval([1, 2, 4, null]);
    expect(s.recallAt1).toBe(0.25);
    expect(s.recallAt3).toBe(0.5);
    expect(s.recallAt5).toBe(0.75);
    expect(s.mrr).toBeCloseTo((1 + 0.5 + 0.25 + 0) / 4);
  });
});

describe("missingFacts", () => {
  it("ignores currency symbols, commas and case", () => {
    expect(missingFacts("The cap is ₹6000 per night.", ["6,000"])).toEqual([]);
    expect(missingFacts("You get 24 Days.", ["24 days", "31 March"])).toEqual(["31 March"]);
  });
});

describe("citedSourceNumbers", () => {
  it("finds each distinct [n] marker", () => {
    expect(citedSourceNumbers("A [2]. B [1][2]. C [10].")).toEqual([1, 2, 10]);
  });
});
