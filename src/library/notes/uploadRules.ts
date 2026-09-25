// Upload rules for the Notes upload/OCR popup - the same limits the old
// Notes-tab uploader used, kept in sync with what class resources can show.
export const MAX_FILES_PER_BATCH = 5;
export const IMAGE_TYPES = ["png", "jpg", "jpeg", "webp"];
export const VALID_EXTENSIONS = [
  "pdf", "docx", "xlsx", "xls", "zip", "pptx", "one",
  ...IMAGE_TYPES,
  "txt", "py", "js", "jsx", "ts", "tsx", "java", "go", "sql", "c", "cpp",
  "cs", "rs", "html", "css", "php", "rb", "kt", "swift", "sh", "asm",
];
export const ACCEPT_ATTR = VALID_EXTENSIONS.map((ext) => `.${ext}`).join(",");

export function fileExtension(name: string): string | null {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return VALID_EXTENSIONS.includes(ext) ? ext : null;
}

export function isImage(name: string): boolean {
  return IMAGE_TYPES.includes(fileExtension(name) ?? "");
}
