import { extractPdfTextFromUrl, fetchInternal } from "./pdfExtract";
import { ocrImage } from "./ocrClient";

// Plain-text/code types — same set the upload/preview flow already accepts
// (see CODE_TYPES in ResourcePreview.tsx), just read as raw text, no parser
// library needed.
const PLAIN_TEXT_TYPES = [
  "txt", "py", "js", "jsx", "ts", "tsx", "java", "go", "sql", "c", "cpp",
  "cs", "rs", "html", "css", "php", "rb", "kt", "swift", "sh", "asm",
];

// File types the AI assistant can actually read/index. Kept in sync with the
// extraction dispatch below — anything not listed here degrades to a clear
// "not supported yet" message instead of silently failing.
export const SUPPORTED_DOCUMENT_TYPES = ["pdf", "docx", "xlsx", "xls", ...PLAIN_TEXT_TYPES];

// Images of handwritten/printed notes: no embedded text to parse, so they're
// sent to the OCR vision model (src/library/ocrClient.ts) and the returned
// transcription is treated as the document's text. Kept in sync with the
// image extensions accepted by the upload UIs (notes page + ResourcePreview).
export const IMAGE_FILE_TYPES = ["png", "jpg", "jpeg", "webp"];

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
// (already used elsewhere), mammoth for Word docs, SheetJS for spreadsheets,
// plain-text read for code/txt files, and the OCR vision model for images.
// Same libraries the resource viewer already uses client-side, just run
// server-side here so the AI can read/search/index the same file types.
export async function extractDocumentText(fullUrl: string, fileType: string): Promise<string> {
  switch (fileType) {
    case "pdf":
      return extractPdfTextFromUrl(fullUrl);
    case "docx":
      return extractDocxText(fullUrl);
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
