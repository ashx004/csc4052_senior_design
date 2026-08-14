import { NextRequest } from "next/server";
import { PAGE_BREAK_MARKER } from "./chunking";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

// Mirrors pdf-parse's own default render_page (same getTextContent options,
// same lastY-based line-break heuristic) so page-aware extraction doesn't
// change how a page's text reads — it only adds a marker chunking.ts can
// split on, so search citations can name the page a chunk actually came
// from instead of just the document.
function renderPageWithMarker(pageData: any): Promise<string> {
  const renderOptions = { normalizeWhitespace: false, disableCombineTextItems: false };
  return pageData.getTextContent(renderOptions).then((textContent: any) => {
    let lastY;
    let text = "";
    for (const item of textContent.items) {
      if (lastY === item.transform[5] || !lastY) {
        text += item.str;
      } else {
        text += "\n" + item.str;
      }
      lastY = item.transform[5];
    }
    return text + PAGE_BREAK_MARKER;
  });
}

export function resolveInternalUrl(request: NextRequest, relativeUrl: string): string {
  const host = request.headers.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}${relativeUrl}`;
}

// /api/download now requires either a logged-in owner or this internal
// header (see verifyAuth.ts) — every server-to-server document fetch must
// go through this instead of a bare fetch().
export function fetchInternal(url: string): Promise<Response> {
  return fetch(url, {
    headers: process.env.INTERNAL_API_SECRET ? { "x-internal-secret": process.env.INTERNAL_API_SECRET } : {},
  });
}

export async function extractPdfTextFromUrl(fullUrl: string): Promise<string> {
  const fileResponse = await fetchInternal(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download PDF (${fileResponse.status})`);
  }

  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const pdfData = await pdfParse(fileBuffer, { pagerender: renderPageWithMarker });
  // .trim() only strips leading/trailing whitespace — PAGE_BREAK_MARKER is
  // non-whitespace (see chunking.ts) and survives, including a trailing one
  // after the last page, which chunkText's split() handles fine (its final
  // page-text segment is just empty).
  return (pdfData.text as string).trim();
}
