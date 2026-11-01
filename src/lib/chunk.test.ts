import { describe, expect, it } from "vitest";
import { chunkText } from "./chunk";

describe("chunkText", () => {
  it("keeps headings as a breadcrumb path on each chunk", () => {
    const md = "# Policy\n\nIntro text.\n\n## Travel\n\nBook economy.\n\n### Hotels\n\nCap is 6000.\n\n## Meals\n\nPer diem.";
    const chunks = chunkText(md);
    expect(chunks.map((c) => c.heading)).toEqual([
      "Policy",
      "Policy › Travel",
      "Policy › Travel › Hotels",
      "Policy › Meals", // deeper "Hotels" heading is dropped when we move back up a level
    ]);
  });

  it("never lets a chunk straddle two sections", () => {
    const chunks = chunkText("## A\n\nalpha text\n\n## B\n\nbeta text");
    expect(chunks).toHaveLength(2);
    expect(chunks[0].content).not.toContain("beta");
  });

  it("respects the size budget", () => {
    const para = "word ".repeat(200).trim(); // ~1000 chars
    const chunks = chunkText([para, para, para, para].join("\n\n"), { maxChars: 600, overlap: 100 });
    expect(chunks.length).toBeGreaterThan(4);
    for (const c of chunks) expect(c.content.length).toBeLessThanOrEqual(601);
  });

  it("overlaps consecutive chunks within a section", () => {
    const sentences = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} is here.`).join(" ");
    const chunks = chunkText(sentences, { maxChars: 300, overlap: 80 });
    expect(chunks.length).toBeGreaterThan(1);
    const tailOfFirst = chunks[0].content.slice(-30);
    expect(chunks[1].content).toContain(tailOfFirst);
  });

  it("numbers chunks sequentially across the whole document", () => {
    const chunks = chunkText("# A\n\none\n\n# B\n\ntwo\n\n# C\n\nthree");
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("returns nothing for empty or heading-only input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("# Just a title\n\n## And a subtitle")).toEqual([]);
  });

  it("rejects an overlap that is not smaller than the chunk size", () => {
    expect(() => chunkText("x", { maxChars: 100, overlap: 100 })).toThrow();
  });
});
