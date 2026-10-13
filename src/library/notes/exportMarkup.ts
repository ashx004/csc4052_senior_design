// Pure helpers for exporting a note's markup (ink, highlights, text boxes,
// stickers) as files. Canvas drawing lives in components/notes/markupCanvas.ts.
import type { PageAnnotations } from "./types";

/** One piece of searchable text on a page, in page pixels from the top-left corner. */
export interface TextRun {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportPage {
  /** Page size in page pixels (the coordinates the marks are stored in). */
  width: number;
  height: number;
  annotations: PageAnnotations;
  /** The words on the page, laid invisibly under the picture so the exported PDF
   *  can be searched and its text selected and copied. */
  text?: TextRun[];
  /** The page's own content (PDF page, photo, rendered document) to draw the
   *  marks over. Without it the page is plain white. */
  base?: () => Promise<CanvasImageSource | null>;
}

export const hasMarks = (page: PageAnnotations | undefined): boolean =>
  !!page && (page.strokes.length > 0 || page.texts.length > 0 || page.stickers.length > 0);

export const MARKUP_FORMAT = "catalyst-markup";
export const MARKUP_VERSION = 1;

/** Lossless copy of the marks, so they can be re-imported or processed. */
export function markupToJson(
  note: { id: string; title: string; fileType?: string },
  pages: { width: number; height: number; annotations: PageAnnotations }[],
): string {
  return JSON.stringify(
    {
      format: MARKUP_FORMAT,
      version: MARKUP_VERSION,
      note: { id: note.id, title: note.title, fileType: note.fileType ?? null },
      pages: pages.map((page, index) => ({
        page: index + 1,
        width: page.width,
        height: page.height,
        strokes: page.annotations.strokes,
        texts: page.annotations.texts,
        stickers: page.annotations.stickers,
      })),
    },
    null,
    2,
  );
}

const encoder = new TextEncoder();

/** Latin-1 bytes for a PDF string. Standard PDF fonts only cover Latin-1, so
 *  anything outside it becomes "?" rather than corrupting the file. */
function latin1(value: string): string {
  let out = "";
  for (const char of value) {
    const code = char.codePointAt(0)!;
    out += (code >= 0x20 && code <= 0x7e) || (code >= 0xa0 && code <= 0xff) ? char : code === 0x09 || code === 0x0a ? " " : "?";
  }
  return out;
}

const pdfEscape = (value: string) => latin1(value).replace(/[\\()]/g, (c) => `\\${c}`);

/** Content-stream commands drawing the runs as invisible text (render mode 3).
 *  Each word is stretched to the width it occupies on the picture so selecting
 *  it highlights roughly the right spot. */
export function invisibleTextCommands(runs: TextRun[], pageHeight: number): string {
  const commands: string[] = ["BT", "3 Tr"];
  for (const run of runs) {
    const text = run.text.trim();
    if (!text || run.width <= 0 || run.height <= 0) continue;
    const size = Math.max(4, run.height * 0.8);
    // Helvetica's average glyph is about half an em wide.
    const scale = Math.min(400, Math.max(20, (run.width / (text.length * size * 0.5)) * 100));
    const x = (run.x * 0.75).toFixed(2);
    const y = ((pageHeight - run.y - run.height * 0.8) * 0.75).toFixed(2);
    commands.push(`/F1 ${(size * 0.75).toFixed(2)} Tf ${scale.toFixed(0)} Tz 1 0 0 1 ${x} ${y} Tm (${pdfEscape(text)}) Tj`);
    // A word's trailing space keeps copied text from running words together.
    commands.push(`1 0 0 1 ${((run.x + run.width) * 0.75).toFixed(2)} ${y} Tm 100 Tz ( ) Tj`);
  }
  commands.push("ET");
  return commands.length > 3 ? commands.join("\n") : "";
}

/** Spreads a transcript that has no positions (OCR of a scan) down the pages, a
 *  line at a time, in proportion to each page's share of the lines. The words
 *  are searchable and copyable but not aligned to the handwriting. */
export function layoutTranscript(text: string, pageWidth: number, pageHeight: number, pageCount: number): TextRun[][] {
  const pages: TextRun[][] = Array.from({ length: Math.max(0, pageCount) }, () => []);
  if (pages.length === 0) return pages;
  const lines = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:#{1,6}\s+|[-*+>]\s+)/, "").trim())
    .filter(Boolean);
  const perPage = Math.max(1, Math.ceil(lines.length / pages.length));
  const margin = 48;
  const lineHeight = Math.max(10, Math.min(28, (pageHeight - margin * 2) / perPage));
  lines.forEach((line, index) => {
    const page = Math.min(pages.length - 1, Math.floor(index / perPage));
    const row = index - page * perPage;
    pages[page].push({ text: line, x: margin, y: margin + row * lineHeight, width: pageWidth - margin * 2, height: lineHeight * 0.8 });
  });
  return pages;
}

/** One image-only PDF page per JPEG. Page pixels are 1/96 inch, so a 2x
 *  render is declared at width*0.75 points and stays sharp. */
export function jpegPdf(pages: { jpeg: Uint8Array; pixelWidth: number; pixelHeight: number; width: number; height: number; text?: TextRun[] }[]): Blob {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (data: Uint8Array | string) => {
    const bytes = typeof data === "string" ? encoder.encode(data) : data;
    chunks.push(bytes);
    length += bytes.length;
  };
  const beginObject = (id: number) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
  };

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const pageObject = (i: number) => 3 + i * 3;
  const fontObject = 3 + pages.length * 3;
  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(" ")}] >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pdfWidth = (page.width * 0.75).toFixed(2);
    const pdfHeight = (page.height * 0.75).toFixed(2);
    const id = pageObject(i);
    beginObject(id);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> /Font << /F1 ${fontObject} 0 R >> >> /Contents ${id + 2} 0 R >>\nendobj\n`);
    beginObject(id + 1);
    push(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push("\nendstream\nendobj\n");
    // The picture first, then the words invisibly on top (so they can be selected but never seen).
    const textLayer = page.text?.length ? invisibleTextCommands(page.text, page.height) : "";
    const content = `q ${pdfWidth} 0 0 ${pdfHeight} 0 0 cm /Im0 Do Q${textLayer ? `\n${textLayer}` : ""}`;
    beginObject(id + 2);
    // Latin-1, one byte per character, so the declared length is exact.
    const contentBytes = Uint8Array.from(content, (char) => char.charCodeAt(0) & 0xff);
    push(`<< /Length ${contentBytes.length} >>\nstream\n`);
    push(contentBytes);
    push("\nendstream\nendobj\n");
  });

  beginObject(fontObject);
  push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>\nendobj\n");

  const count = fontObject + 1;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, "0")} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

export const exportFileNames = (title: string) => ({
  pdf: `${title} (marked up).pdf`,
  png: `${title} - markup.png`,
  json: `${title} - markup.json`,
  notes: `${title} - notes.md`,
  zip: `${title} - export.zip`,
});
