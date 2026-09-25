import { NextRequest } from "next/server";
import path from "path";
import { pathToFileURL } from "url";
import { PAGE_BREAK_MARKER } from "./chunking";

type PositionedText = {
  text: string;
  x: number;
  y: number;
};


export function resolveInternalUrl(request: NextRequest, relativeUrl: string): string {
  const host = request.headers.get("host");

  const protocol =
    process.env.NODE_ENV === "development"
      ? "http"
      : "https";

  return `${protocol}://${host}${relativeUrl}`;
}

export function fetchInternal(
  url: string
): Promise<Response> {
  return fetch(url, {
    headers: process.env.INTERNAL_API_SECRET
      ? {
          "x-internal-secret":
            process.env.INTERNAL_API_SECRET,
        }
      : {},
  });
}

export async function extractPdfTextFromUrl(
  fullUrl: string
): Promise<string> {
  const fileResponse = await fetchInternal(fullUrl);

  if (!fileResponse.ok) {
    throw new Error(
      `Failed to download PDF (${fileResponse.status})`
    );
  }

  const arrayBuffer =
    await fileResponse.arrayBuffer();

  const data = new Uint8Array(arrayBuffer);

  /*
    Dynamically import PDF.js so Next.js does not
    bundle it the same way as a normal top-level import.
  */
  const pdfjsLib = await import(
    "pdfjs-dist/legacy/build/pdf.mjs"
  );

  /*
    Point PDF.js directly to the worker inside node_modules.
  */
  const workerPath = path.join(
    process.cwd(),
    "node_modules",
    "pdfjs-dist",
    "legacy",
    "build",
    "pdf.worker.mjs"
  );


  pdfjsLib.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

  const pdf = await pdfjsLib.getDocument({
    data,
  }).promise;

  const pages: string[] = [];

  for (
    let pageNumber = 1;
    pageNumber <= pdf.numPages;
    pageNumber++
  ) {
    const page =
      await pdf.getPage(pageNumber);

    const content =
      await page.getTextContent();

    const items: PositionedText[] =
      content.items
        .filter(
          (item: any) =>
            "str" in item &&
            item.str.trim() !== ""
        )
        .map((item: any) => ({
          text: item.str,
          x: item.transform[4],
          y: item.transform[5],
        }));

        const lines: PositionedText[][] = [];

        for (const item of items) {
          let line = lines.find(
            (existingLine) =>
              Math.abs(
                existingLine[0].y - item.y
              ) < 3
          );

          if (!line) {
            line = [];
            lines.push(line);
          }

          line.push(item);
        }

        // Top-to-bottom reading order (PDF y increases upward).
        lines.sort((a, b) => b[0].y - a[0].y);

        // Left-to-right within each line, so line[0] is the leftmost item.
        for (const line of lines) {
          line.sort((a, b) => a.x - b.x);
        }

        /*
          A course title too long for one line wraps onto its own line in
          the extracted text. That wrapped line has no course code and no
          grade/credit-hour columns — only leftover title words, indented
          to roughly the title column's x position rather than the
          leftmost "course code" column. Detect that pattern and re-merge
          the wrapped line into the row above it.
        */

        const NUMERIC_TOKEN = /^\d+(\.\d+)?$/;
        const GRADE_TOKEN = /^(IP|[A-F][+-]?|P|W|R)$/;

        function hasDataColumns(line: PositionedText[]): boolean {
          return line.some((item) => {
            const text = item.text.trim();
            return NUMERIC_TOKEN.test(text) || GRADE_TOKEN.test(text);
          });
        }

        // Establish where real data rows start (the "course code" column)
        // by averaging the leftmost x of every line that has grade/credit data.
        const codeColumnXs = lines
          .filter((line) => hasDataColumns(line))
          .map((line) => line[0].x);

        const codeColumnX =
          codeColumnXs.length > 0
            ? codeColumnXs.reduce((sum, x) => sum + x, 0) / codeColumnXs.length
            : 0;

        const WRAP_INDENT_THRESHOLD = 10; // points right of the code column
        const MAX_WRAP_LINE_GAP = 20; // max vertical gap (points) to count as a wrapped continuation

        const mergedLines: PositionedText[][] = [];

        for (const line of lines) {
          const previous = mergedLines[mergedLines.length - 1];

          const isIndentedPastCodeColumn =
            line[0].x > codeColumnX + WRAP_INDENT_THRESHOLD;

          const verticalGap = previous
            ? Math.abs(previous[0].y - line[0].y)
            : Infinity;

          const looksLikeWrappedTitle =
            !!previous &&
            isIndentedPastCodeColumn &&
            !hasDataColumns(line) &&
            verticalGap < MAX_WRAP_LINE_GAP;

          if (looksLikeWrappedTitle) {
            previous.push(...line);
            previous.sort((a, b) => a.x - b.x);
          } else {
            mergedLines.push(line);
          }
        }

        const pageLines = mergedLines.map((line) =>
          line.map((item) => item.text).join(" ").trim()
        );

    pages.push(
      `--- PAGE ${pageNumber} ---\n${pageLines.join("\n")}`
    );
  }

    return pages.join("\n\n").trim();
}