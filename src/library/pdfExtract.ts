import { NextRequest } from "next/server";
import path from "path";
import { pathToFileURL } from "url";

type PositionedText = {
  text: string;
  x: number;
  y: number;
};

export function resolveInternalUrl(
  request: NextRequest,
  relativeUrl: string
): string {
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

    lines.sort(
      (a, b) => b[0].y - a[0].y
    );

    const pageLines = lines.map(
      (line) => {
        line.sort(
          (a, b) => a.x - b.x
        );

        return line
          .map((item) => item.text)
          .join(" ")
          .trim();
      }
    );

    pages.push(
      `--- PAGE ${pageNumber} ---\n${pageLines.join("\n")}`
    );
  }

  return pages
    .join("\n\n")
    .trim();
}