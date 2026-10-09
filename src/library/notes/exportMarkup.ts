// Pure helpers for exporting a note's markup (ink, highlights, text boxes,
// stickers) as files. Canvas drawing lives in components/notes/markupCanvas.ts.
import type { PageAnnotations } from "./types";

export interface ExportPage {
  /** Page size in page pixels (the coordinates the marks are stored in). */
  width: number;
  height: number;
  annotations: PageAnnotations;
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

/** One image-only PDF page per JPEG. Page pixels are 1/96 inch, so a 2x
 *  render is declared at width*0.75 points and stays sharp. */
export function jpegPdf(pages: { jpeg: Uint8Array; pixelWidth: number; pixelHeight: number; width: number; height: number }[]): Blob {
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
  beginObject(1);
  push("<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  beginObject(2);
  push(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageObject(i)} 0 R`).join(" ")}] >>\nendobj\n`);

  pages.forEach((page, i) => {
    const pdfWidth = (page.width * 0.75).toFixed(2);
    const pdfHeight = (page.height * 0.75).toFixed(2);
    const id = pageObject(i);
    beginObject(id);
    push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>\nendobj\n`);
    beginObject(id + 1);
    push(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
    push(page.jpeg);
    push("\nendstream\nendobj\n");
    const content = `q ${pdfWidth} 0 0 ${pdfHeight} 0 0 cm /Im0 Do Q`;
    beginObject(id + 2);
    push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);
  });

  const count = 3 + pages.length * 3;
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
