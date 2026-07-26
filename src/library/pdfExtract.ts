import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

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
  const pdfData = await pdfParse(fileBuffer);
  return (pdfData.text as string).trim();
}
