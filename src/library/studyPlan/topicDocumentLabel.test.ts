import { describe, expect, it } from "vitest";
import { topicDocumentLabel } from "./topicDocumentLabel";

describe("topicDocumentLabel", () => {
  it("strips a directory, a numeric prefix and the extension", () => {
    expect(topicDocumentLabel("uploads/03-cell-respiration.pdf")).toBe("Cell Respiration");
  });

  it("strips a date prefix", () => {
    expect(topicDocumentLabel("2026-01-14_photosynthesis.docx")).toBe("Photosynthesis");
  });

  it("turns separators into single spaces", () => {
    expect(topicDocumentLabel("week__two---notes.pdf")).toBe("Week Two Notes");
  });

  it("keeps a name that needs no tidying", () => {
    expect(topicDocumentLabel("Photosynthesis")).toBe("Photosynthesis");
  });

  it("falls back to the raw name when tidying leaves nothing", () => {
    expect(topicDocumentLabel("___.pdf")).toBe("___.pdf");
  });

  it("falls back to the raw name for a blank result", () => {
    expect(topicDocumentLabel("   ")).toBe("   ");
  });
});
