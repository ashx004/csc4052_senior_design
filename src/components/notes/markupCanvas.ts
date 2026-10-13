import { drawSticker, STICKER_SIZE } from "@/src/library/notes/stickers";
import type { ExportPage, TextRun } from "@/src/library/notes/exportMarkup";
import type { PageAnnotations } from "@/src/library/notes/types";
import { drawInkStroke } from "./InkLayer";

const INK = "#1f2328";
const TEXT_LINE = 24;

/** Draws a page's marks in page coordinates, in the order they stack on
 *  screen: highlights, pen, text boxes, stickers. Exports always use the
 *  light-paper look so they read the same wherever they are opened. */
export function paintMarkup(ctx: CanvasRenderingContext2D, annotations: PageAnnotations) {
  annotations.strokes.filter((s) => s.tool === "highlighter").forEach((s) => drawInkStroke(ctx, s, INK, false));
  annotations.strokes.filter((s) => s.tool !== "highlighter").forEach((s) => drawInkStroke(ctx, s, INK, false));
  for (const note of annotations.texts) {
    const lines = note.text.split("\n");
    ctx.save();
    ctx.font = "15px system-ui, sans-serif";
    const width = Math.max(60, ...lines.map((line) => ctx.measureText(line).width)) + 12;
    ctx.fillStyle = "rgba(255,253,235,0.92)";
    ctx.beginPath();
    ctx.roundRect(note.x, note.y, width, lines.length * TEXT_LINE + 4, 4);
    ctx.fill();
    ctx.fillStyle = INK;
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => ctx.fillText(line, note.x + 6, note.y + 2 + TEXT_LINE / 2 + i * TEXT_LINE));
    ctx.restore();
  }
  annotations.stickers.forEach((s) => drawSticker(ctx, s.emoji, s.x, s.y, s.size ?? STICKER_SIZE.default));
}

const SCALE = 2;

/** `withBase`: the page's own content under the marks (white if it has none);
 *  otherwise the canvas stays transparent so only the marks are drawn. */
export async function renderExportPage(page: ExportPage, withBase: boolean): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(page.width * SCALE);
  canvas.height = Math.round(page.height * SCALE);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(SCALE, SCALE);
  if (withBase) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, page.width, page.height);
    const base = page.base ? await page.base() : null;
    if (base) ctx.drawImage(base, 0, 0, page.width, page.height);
  }
  paintMarkup(ctx, page.annotations);
  return canvas;
}

export const canvasBlob = (canvas: HTMLCanvasElement, type: "image/png" | "image/jpeg"): Promise<Blob> =>
  new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't render a page."))), type, type === "image/jpeg" ? 0.92 : undefined),
  );

/** Rasterises a piece of the page's DOM (a Word file, spreadsheet or source
 *  file) at the sheet's own width. */
export async function captureElement(el: HTMLElement): Promise<HTMLCanvasElement> {
  const { toCanvas } = await import("html-to-image");
  return toCanvas(el, { pixelRatio: SCALE, backgroundColor: "#ffffff" });
}

/** Where every word of a rendered piece of the page sits, sorted into the page it falls on.
 *  Used to lay invisible, selectable text exactly under the picture of it. */
export function collectTextRuns(el: HTMLElement, pageHeight: number, pageCount: number): TextRun[][] {
  const pages: TextRun[][] = Array.from({ length: pageCount }, () => []);
  const box = el.getBoundingClientRect();
  // The sheet may be zoomed with a CSS transform; page pixels are the unzoomed ones.
  const zoom = el.offsetWidth ? box.width / el.offsetWidth : 1;
  if (!zoom || box.width === 0) return pages;
  const range = document.createRange();
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest("script,style,.katex-mathml") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const value = node.nodeValue ?? "";
    for (const match of value.matchAll(/\S+/g)) {
      range.setStart(node, match.index!);
      range.setEnd(node, match.index! + match[0].length);
      const rect = range.getClientRects()[0];
      if (!rect || rect.width < 2 || rect.height < 2) continue;
      const y = (rect.top - box.top) / zoom;
      const height = rect.height / zoom;
      const page = Math.floor((y + height / 2) / pageHeight);
      if (page < 0 || page >= pageCount) continue;
      pages[page].push({ text: match[0], x: (rect.left - box.left) / zoom, y: y - page * pageHeight, width: rect.width / zoom, height });
    }
  }
  return pages;
}

/** Cuts one page-high slice out of a tall capture made by `captureElement`. */
export function sliceCapture(shot: HTMLCanvasElement, pageIndex: number, pageWidth: number, pageHeight: number): HTMLCanvasElement {
  const slice = document.createElement("canvas");
  slice.width = Math.round(pageWidth * SCALE);
  slice.height = Math.round(pageHeight * SCALE);
  const ctx = slice.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, slice.width, slice.height);
  const top = Math.round(pageIndex * pageHeight * SCALE);
  const rows = Math.max(0, Math.min(slice.height, shot.height - top));
  if (rows > 0) ctx.drawImage(shot, 0, top, Math.min(shot.width, slice.width), rows, 0, 0, Math.min(shot.width, slice.width), rows);
  return slice;
}
