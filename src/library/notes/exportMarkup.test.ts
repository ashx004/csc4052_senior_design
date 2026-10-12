import { describe, expect, it } from "vitest";
import { EMPTY_PAGE, type PageAnnotations } from "./types";
import { exportFileNames, hasMarks, jpegPdf, markupToJson } from "./exportMarkup";

const marked: PageAnnotations = {
  strokes: [{ id: "s1", tool: "pencil", color: "ink", width: 2, points: [0, 0, 10, 10] }],
  texts: [{ id: "t1", x: 5, y: 6, text: "check this" }],
  stickers: [{ id: "k1", x: 1, y: 2, emoji: "⭐", size: 40 }],
};

describe("hasMarks", () => {
  it("is false for empty or missing pages and true for any mark", () => {
    expect(hasMarks(undefined)).toBe(false);
    expect(hasMarks(EMPTY_PAGE)).toBe(false);
    expect(hasMarks({ ...EMPTY_PAGE, texts: marked.texts })).toBe(true);
    expect(hasMarks({ ...EMPTY_PAGE, stickers: marked.stickers })).toBe(true);
  });
});

describe("markupToJson", () => {
  it("keeps every mark, numbered by page", () => {
    const parsed = JSON.parse(markupToJson({ id: "n1", title: "Guide", fileType: "docx" }, [{ width: 816, height: 1056, annotations: marked }, { width: 816, height: 1056, annotations: EMPTY_PAGE }]));
    expect(parsed.format).toBe("catalyst-markup");
    expect(parsed.note).toEqual({ id: "n1", title: "Guide", fileType: "docx" });
    expect(parsed.pages.map((p: { page: number }) => p.page)).toEqual([1, 2]);
    expect(parsed.pages[0].strokes).toEqual(marked.strokes);
    expect(parsed.pages[0].texts).toEqual(marked.texts);
    expect(parsed.pages[0].stickers).toEqual(marked.stickers);
  });
});

describe("jpegPdf", () => {
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 0xff, 0xd9]);
  const page = { jpeg, pixelWidth: 1632, pixelHeight: 2112, width: 816, height: 1056 };

  async function build(count: number) {
    const bytes = new Uint8Array(await jpegPdf(Array.from({ length: count }, () => page)).arrayBuffer());
    return { bytes, text: new TextDecoder("latin1").decode(bytes) };
  }

  it("declares one page per image, sized in points", async () => {
    const { text } = await build(3);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text).toContain("/Count 3");
    expect((text.match(/\/Type \/Page /g) ?? []).length).toBe(3);
    expect(text).toContain("/MediaBox [0 0 612.00 792.00]");
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
  });

  it("has an xref table whose offsets land on each object", async () => {
    const { text } = await build(2);
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe("xref");
    const entries = [...text.slice(start).matchAll(/^(\d{10}) \d{5} n $/gm)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(2 * 3 + 2);
    entries.forEach((offset, i) => expect(text.slice(offset, offset + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
  });

  it("embeds the JPEG bytes untouched", async () => {
    const { bytes } = await build(1);
    const needle = Array.from(jpeg).join(",");
    const haystack = Array.from(bytes).join(",");
    expect(haystack).toContain(needle);
  });
});

describe("exportFileNames", () => {
  it("builds distinct names from the title", () => {
    const names = Object.values(exportFileNames("Guide"));
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.startsWith("Guide"))).toBe(true);
  });
});
