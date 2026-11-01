import { describe, expect, it } from "vitest";
import { reciprocalRankFusion } from "./rrf";

const id = (s: string) => s;

describe("reciprocalRankFusion", () => {
  it("ranks an item found by both retrievers above items found by only one", () => {
    const fused = reciprocalRankFusion([["a", "b", "c"], ["d", "c", "e"]], id);
    expect(fused[0].item).toBe("c");
  });

  it("uses 1 / (k + rank) per list", () => {
    const [top] = reciprocalRankFusion([["a"], ["a"]], id, 60);
    expect(top.score).toBeCloseTo(2 / 61);
    expect(top.ranks).toEqual([1, 1]);
  });

  it("records null for lists an item was missing from", () => {
    const fused = reciprocalRankFusion([["a"], ["b"]], id);
    expect(fused.find((f) => f.item === "a")?.ranks).toEqual([1, null]);
    expect(fused.find((f) => f.item === "b")?.ranks).toEqual([null, 1]);
  });

  it("counts an item only once per list even if it repeats", () => {
    const [top] = reciprocalRankFusion([["a", "a", "a"]], id, 60);
    expect(top.score).toBeCloseTo(1 / 61);
  });

  it("handles empty input", () => {
    expect(reciprocalRankFusion([[], []], id)).toEqual([]);
  });
});
