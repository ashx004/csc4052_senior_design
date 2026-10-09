import { drawSticker, STICKER_SIZE } from "@/src/library/notes/stickers";
import type { ExportPage } from "@/src/library/notes/exportMarkup";
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
