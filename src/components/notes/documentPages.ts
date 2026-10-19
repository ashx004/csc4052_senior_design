"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy, RenderTask } from "pdfjs-dist";
import { MAX_DOCUMENT_PAGES, PAGE_WIDTH } from "@/src/library/notes/types";

/** An opened document's pages. Only their sizes are known up front; each
 *  page's picture is fetched or drawn when it's needed. */
export type DocumentPages =
  | { kind: "images"; urls: string[]; heights: number[]; totalPages: number }
  | { kind: "pdf"; pdf: PDFDocumentProxy; close: () => void; heights: number[]; totalPages: number };

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export async function openImagePages(urls: string[]): Promise<DocumentPages> {
  const shown = urls.slice(0, MAX_DOCUMENT_PAGES);
  const heights = await Promise.all(
    shown.map(async (url) => {
      const img = await loadImage(url);
      return img?.naturalWidth ? Math.round((PAGE_WIDTH * img.naturalHeight) / img.naturalWidth) : Math.round(PAGE_WIDTH * 1.294); // letter-shaped fallback
    })
  );
  return { kind: "images", urls: shown, heights, totalPages: urls.length };
}

/** Opens a PDF and reads every page's size, which is cheap; nothing is drawn yet. */
export async function openPdfPages(url: string, onProgress: (done: number, total: number) => void): Promise<DocumentPages> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;
  const task = pdfjsLib.getDocument({ url });
  const pdf = await task.promise;
  const total = Math.min(pdf.numPages, MAX_DOCUMENT_PAGES);
  let done = 0;
  const heights = await Promise.all(
    Array.from({ length: total }, async (_, i) => {
      const page = await pdf.getPage(i + 1);
      const base = page.getViewport({ scale: 1 });
      onProgress(++done, total);
      return Math.round((PAGE_WIDTH * base.height) / base.width);
    })
  );
  return { kind: "pdf", pdf, close: () => void task.destroy(), heights, totalPages: pdf.numPages };
}

/** Draws one PDF page into `canvas`. `cancel()` stops a draw that's no longer needed. */
export function drawPdfPage(pdf: PDFDocumentProxy, index: number, canvas: HTMLCanvasElement, pixelRatio: number) {
  let task: RenderTask | null = null;
  let cancelled = false;
  const done = (async () => {
    const page = await pdf.getPage(index + 1);
    if (cancelled) return;
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: (PAGE_WIDTH / base.width) * pixelRatio });
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    task = page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport });
    await task.promise;
  })();
  return {
    done,
    cancel: () => {
      cancelled = true;
      task?.cancel();
    },
  };
}

/** A page's picture on its own, for exports. Drawn fresh at 2x and not kept. */
export async function pageImage(pages: DocumentPages, index: number): Promise<CanvasImageSource | null> {
  if (pages.kind === "images") return loadImage(pages.urls[index]);
  const canvas = document.createElement("canvas");
  await drawPdfPage(pages.pdf, index, canvas, 2).done;
  return canvas;
}

/** Which pages are close enough to the screen to be drawn. Pages join within
 *  1.5 screens of the viewport and leave beyond 4, so scrolling back and
 *  forth a little doesn't redraw them. Attach `observe` as each page slot's
 *  ref, with the page index in `data-page-slot`. */
export function useNearPages() {
  const [near, setNear] = useState<ReadonlySet<number>>(() => new Set());
  const elements = useRef(new Set<Element>());
  const observers = useRef<IntersectionObserver[]>([]);

  useEffect(() => {
    const indexOf = (el: Element) => Number((el as HTMLElement).dataset.pageSlot);
    const change = (indices: number[], add: boolean) => {
      if (!indices.length) return;
      setNear((prev) => {
        if (indices.every((i) => prev.has(i) === add)) return prev;
        const next = new Set(prev);
        indices.forEach((i) => (add ? next.add(i) : next.delete(i)));
        return next;
      });
    };
    const load = new IntersectionObserver(
      (entries) => change(entries.filter((e) => e.isIntersecting).map((e) => indexOf(e.target)), true),
      { rootMargin: "150% 0px" }
    );
    const keep = new IntersectionObserver(
      (entries) => change(entries.filter((e) => !e.isIntersecting).map((e) => indexOf(e.target)), false),
      { rootMargin: "400% 0px" }
    );
    observers.current = [load, keep];
    elements.current.forEach((el) => observers.current.forEach((o) => o.observe(el)));
    return () => {
      load.disconnect();
      keep.disconnect();
      observers.current = [];
    };
  }, []);

  const observe = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    elements.current.add(el);
    observers.current.forEach((o) => o.observe(el));
    return () => {
      elements.current.delete(el);
      observers.current.forEach((o) => o.unobserve(el));
    };
  }, []);

  return { near, observe };
}
