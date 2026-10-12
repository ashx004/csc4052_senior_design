/** Renders a PDF's pages to JPEG files in the browser, so a scanned or
 *  handwritten PDF can be read by OCR the same way photos are. */
export async function renderPdfToImages(
  file: File,
  { maxPages, maxEdge = 2000, onProgress }: { maxPages: number; maxEdge?: number; onProgress?: (done: number, total: number) => void },
): Promise<{ pages: File[]; totalPages: number }> {
  const pdfjsLib = await import("pdfjs-dist");
  pdfjsLib.GlobalWorkerOptions.workerSrc = `/pdf.worker.min.mjs?v=${pdfjsLib.version}`;
  const task = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await task.promise;
  try {
    const total = Math.min(pdf.numPages, maxPages);
    const pages: File[] = [];
    for (let n = 1; n <= total; n++) {
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: maxEdge / Math.max(base.width, base.height) });
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
      if (!blob) throw new Error(`Couldn't read page ${n} of "${file.name}".`);
      pages.push(new File([blob], `Page ${n}.jpg`, { type: "image/jpeg" }));
      page.cleanup();
      onProgress?.(n, total);
    }
    return { pages, totalPages: pdf.numPages };
  } finally {
    void task.destroy();
  }
}
