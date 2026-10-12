import { describe, expect, it } from "vitest";
import { canOcr, defaultOcr, planUpload } from "./uploadRules";

describe("upload OCR rules", () => {
  it("offers OCR for photos and PDFs only", () => {
    expect(canOcr("scan.JPG")).toBe(true);
    expect(canOcr("notes.pdf")).toBe(true);
    expect(canOcr("essay.docx")).toBe(false);
    expect(canOcr("main.py")).toBe(false);
  });

  it("defaults on for photos, off once a PDF is in the batch", () => {
    expect(defaultOcr(["a.png", "b.jpeg"])).toBe(true);
    expect(defaultOcr(["a.png", "b.pdf"])).toBe(false);
    expect(defaultOcr(["a.docx", "b.png"])).toBe(true);
    expect(defaultOcr(["a.docx"])).toBe(false);
    expect(defaultOcr([])).toBe(false);
  });

  it("plans each file by type and the OCR choice", () => {
    expect(planUpload("a.png", true)).toBe("ocr-image");
    expect(planUpload("a.pdf", true)).toBe("ocr-pdf");
    expect(planUpload("a.pdf", false)).toBe("plain");
    expect(planUpload("a.docx", true)).toBe("plain");
  });
});
