import { describe, expect, it } from "vitest";
import { citationLabel } from "./search";

describe("citationLabel", () => {
  it("drops the H1 when it repeats the document title", () => {
    expect(citationLabel("Leave Policy", "Leave Policy › Annual Leave")).toBe("Leave Policy › Annual Leave");
  });
  it("keeps headings that differ from the title", () => {
    expect(citationLabel("Handbook", "Travel › Hotels")).toBe("Handbook › Travel › Hotels");
  });
  it("falls back to the title when there is no heading", () => {
    expect(citationLabel("Notes", null)).toBe("Notes");
  });
});
