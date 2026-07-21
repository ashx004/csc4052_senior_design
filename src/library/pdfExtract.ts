import { NextRequest } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse/lib/pdf-parse.js");

export function resolveInternalUrl(request: NextRequest, relativeUrl: string): string {
  const host = request.headers.get("host");
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";
  return `${protocol}://${host}${relativeUrl}`;
}

export async function extractPdfTextFromUrl(fullUrl: string): Promise<string> {
  const fileResponse = await fetch(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download PDF (${fileResponse.status})`);
  }

  const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const pdfData = await pdfParse(fileBuffer);
  return (pdfData.text as string).trim();
}
