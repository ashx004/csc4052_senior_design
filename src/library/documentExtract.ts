import { extractPdfTextFromUrl, fetchInternal } from "./pdfExtract";
import { ocrImage } from "./ocrClient";
import { parsePptxSlides, pptxSlidesToText } from "./pptxSlides";

import { IMAGE_FILE_TYPES, PLAIN_TEXT_TYPES, SUPPORTED_DOCUMENT_TYPES } from "./documentTypes";

// Re-exported so server code can keep importing them from here.
export { IMAGE_FILE_TYPES, SUPPORTED_DOCUMENT_TYPES };


async function extractDocxText(fullUrl: string): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const fileResponse = await fetchInternal(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download document (${fileResponse.status})`);
  }
  const arrayBuffer = await fileResponse.arrayBuffer();
  const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
  return result.value.trim();
}

async function extractPptxText(fullUrl: string): Promise<string> {
  const fileResponse = await fetchInternal(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download presentation (${fileResponse.status})`);
  }
  return pptxSlidesToText(await parsePptxSlides(await fileResponse.arrayBuffer()));
}

async function extractXlsxText(fullUrl: string): Promise<string> {
  const XLSX = await import("xlsx");
  const fileResponse = await fetchInternal(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download spreadsheet (${fileResponse.status})`);
  }
  const arrayBuffer = await fileResponse.arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return `--- Sheet: ${sheetName} ---\n${csv}`;
  }).join("\n\n");
}

async function extractPlainText(fullUrl: string): Promise<string> {
  const fileResponse = await fetchInternal(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file (${fileResponse.status})`);
  }
  return (await fileResponse.text()).trim();
}

async function extractImageText(fullUrl: string): Promise<string> {
  const fileResponse = await fetchInternal(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download image (${fileResponse.status})`);
  }
  const imageBuffer = Buffer.from(await fileResponse.arrayBuffer());
  return ocrImage(imageBuffer);
}

// Dispatches to the right extractor by file type — pdf-parse for PDFs
// (already used elsewhere), mammoth for Word docs, JSZip for PowerPoint slides, SheetJS for spreadsheets,
// plain-text read for code/txt files, and the OCR vision model for images.
// Same libraries the resource viewer already uses client-side, just run
// server-side here so the AI can read/search/index the same file types.
export async function extractDocumentText(fullUrl: string, fileType: string, options: { maxChars?: number } = {}): Promise<string> {
  switch (fileType) {
    case "pdf":
      return extractPdfTextFromUrl(fullUrl, options);
    case "docx":
      return extractDocxText(fullUrl);
    case "pptx":
      return extractPptxText(fullUrl);
    case "xlsx":
    case "xls":
      return extractXlsxText(fullUrl);
    default:
      if (IMAGE_FILE_TYPES.includes(fileType)) {
        return extractImageText(fullUrl);
      }
      if (PLAIN_TEXT_TYPES.includes(fileType)) {
        return extractPlainText(fullUrl);
      }
      throw new Error(`Unsupported file type: .${fileType}`);
  }
}
