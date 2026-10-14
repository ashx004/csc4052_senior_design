import { describe, expect, it } from "vitest";
import { invisibleTextCommands, jpegPdf, layoutTranscript } from "./exportMarkup";

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
const asText = async (blob: Blob) => Buffer.from(await blob.arrayBuffer()).toString("latin1");

describe("invisibleTextCommands", () => {
  it("draws each word in invisible render mode, escaped and in Latin-1", () => {
    const commands = invisibleTextCommands(
      [
        { text: "f(x)", x: 10, y: 20, width: 40, height: 16 },
        { text: "café", x: 60, y: 20, width: 40, height: 16 },
        { text: "π≈3", x: 110, y: 20, width: 40, height: 16 },
      ],
      1056,
    );
    expect(commands).toContain("3 Tr");
    expect(commands).toContain("(f\\(x\\))");
    expect(commands).toContain("(café)");
    // Characters Helvetica can't show become "?" rather than breaking the file.
    expect(commands).toContain("(??3)");
  });

  it("returns nothing when there is no usable text", () => {
    expect(invisibleTextCommands([], 1056)).toBe("");
    expect(invisibleTextCommands([{ text: " ", x: 0, y: 0, width: 10, height: 10 }], 1056)).toBe("");
  });
});

describe("jpegPdf with a text layer", () => {
  it("keeps a valid cross-reference table and includes the words", async () => {
    const blob = jpegPdf([
      { jpeg, pixelWidth: 2, pixelHeight: 2, width: 816, height: 1056, text: [{ text: "Hello", x: 48, y: 48, width: 50, height: 16 }] },
      { jpeg, pixelWidth: 2, pixelHeight: 2, width: 816, height: 1056 },
    ]);
    const pdf = await asText(blob);
    expect(pdf).toContain("3 Tr");
    expect(pdf).toContain("(Hello)");
    expect(pdf).toContain("/BaseFont /Helvetica");

    const size = Number(/\/Size (\d+)/.exec(pdf)![1]);
    const xref = pdf.slice(pdf.indexOf("xref\n"));
    const entries = xref.split("\n").slice(3, 3 + size - 1);
    entries.forEach((entry, index) => {
      const offset = Number(entry.slice(0, 10));
      expect(pdf.slice(offset, offset + `${index + 1} 0 obj`.length)).toBe(`${index + 1} 0 obj`);
    });
    expect(Number(/startxref\n(\d+)/.exec(pdf)![1])).toBe(pdf.indexOf("xref\n"));
  });

  it("declares a content length that matches the stream", async () => {
    const pdf = await asText(jpegPdf([{ jpeg, pixelWidth: 2, pixelHeight: 2, width: 816, height: 1056, text: [{ text: "café", x: 1, y: 1, width: 40, height: 16 }] }]));
    const match = /<< \/Length (\d+) >>\nstream\n([\s\S]*?)\nendstream/.exec(pdf.slice(pdf.indexOf("/Im0 Do")- 80));
    expect(match).toBeTruthy();
    expect(match![2].length).toBe(Number(match![1]));
  });
});

describe("layoutTranscript", () => {
  it("spreads lines across pages in order and drops markdown markers", () => {
    const pages = layoutTranscript("# Title\n- one\ntwo\nthree\n\nfour", 816, 1056, 2);
    expect(pages).toHaveLength(2);
    expect(pages.flat().map((r) => r.text)).toEqual(["Title", "one", "two", "three", "four"]);
    expect(pages[0].length).toBe(3);
    expect(pages[1].map((r) => r.text)).toEqual(["three", "four"]);
    for (const run of pages.flat()) expect(run.y + run.height).toBeLessThan(1056);
  });

  it("handles an empty transcript and zero pages", () => {
    expect(layoutTranscript("", 816, 1056, 2)).toEqual([[], []]);
    expect(layoutTranscript("text", 816, 1056, 0)).toEqual([]);
  });
});
