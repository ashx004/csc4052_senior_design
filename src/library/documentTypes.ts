// Which file types Catalyst can read. Plain constants, apart from
// documentExtract.ts, so browser code can use them without bundling the
// extractors and the OCR/AI client behind them.

// Plain-text/code types — same set the upload/preview flow already accepts
// (see CODE_TYPES in ResourcePreview.tsx), just read as raw text, no parser
// library needed.
export const PLAIN_TEXT_TYPES = [
  "txt", "md", "csv", "py", "js", "jsx", "ts", "tsx", "java", "go", "sql", "c", "cpp",
  "cs", "rs", "html", "css", "php", "rb", "kt", "swift", "sh", "asm",
];

// Images of handwritten/printed notes: no embedded text to parse, so they're
// sent to the OCR vision model (src/library/ocrClient.ts) and the returned
// transcription is treated as the document's text. Kept in sync with the
// image extensions accepted by the upload UIs (notes page + ResourcePreview).
export const IMAGE_FILE_TYPES = ["png", "jpg", "jpeg", "webp"];

// File types the AI assistant can actually read/index. Kept in sync with the
// extraction dispatch below — anything not listed here degrades to a clear
// "not supported yet" message instead of silently failing.
export const SUPPORTED_DOCUMENT_TYPES = ["pdf", "docx", "pptx", "xlsx", "xls", ...PLAIN_TEXT_TYPES, ...IMAGE_FILE_TYPES];
