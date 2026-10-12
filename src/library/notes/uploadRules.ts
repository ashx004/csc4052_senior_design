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

export function isPdf(name: string): boolean {
  return fileExtension(name) === "pdf";
}

/** Longest PDF the OCR option will read (each page is a model call). */
export const PDF_OCR_MAX_PAGES = 25;

/** Photos and PDFs can be run through OCR; Word, Excel and code files already
 *  carry their text, so the option is not offered for them. */
export function canOcr(name: string): boolean {
  return isImage(name) || isPdf(name);
}

/** What the OCR checkbox starts as: on for photos (handwriting is the usual
 *  reason to add one), off when a PDF is included (most are typed). */
export function defaultOcr(names: string[]): boolean {
  const eligible = names.filter(canOcr);
  return eligible.length > 0 && eligible.every(isImage);
}

/** How one file is stored once OCR is decided: as it is, as a photo that is
 *  read in place, or as a PDF rendered into pages that are read. */
export type UploadPlan = "plain" | "ocr-image" | "ocr-pdf";

export function planUpload(name: string, ocr: boolean): UploadPlan {
  if (ocr && isPdf(name)) return "ocr-pdf";
  if (ocr && isImage(name)) return "ocr-image";
  return "plain";
}
