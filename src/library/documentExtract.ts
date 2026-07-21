import { extractPdfTextFromUrl } from "./pdfExtract";

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

async function extractDocxText(fullUrl: string): Promise<string> {
  const mammoth = (await import("mammoth")).default;
  const fileResponse = await fetch(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download document (${fileResponse.status})`);
  }
  const arrayBuffer = await fileResponse.arrayBuffer();
  const result = await mammoth.extractRawText({ buffer: Buffer.from(arrayBuffer) });
  return result.value.trim();
}

async function extractXlsxText(fullUrl: string): Promise<string> {
  const XLSX = await import("xlsx");
  const fileResponse = await fetch(fullUrl);
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
  const fileResponse = await fetch(fullUrl);
  if (!fileResponse.ok) {
    throw new Error(`Failed to download file (${fileResponse.status})`);
  }
  return (await fileResponse.text()).trim();
}

// Dispatches to the right extractor by file type — pdf-parse for PDFs
// (already used elsewhere), mammoth for Word docs, SheetJS for spreadsheets,
// plain-text read for code/txt files. Same libraries the resource viewer
// already uses client-side, just run server-side here so the AI can
// read/search/index the same file types.
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
      if (PLAIN_TEXT_TYPES.includes(fileType)) {
        return extractPlainText(fullUrl);
      }
      throw new Error(`Unsupported file type: .${fileType}`);
  }
}
