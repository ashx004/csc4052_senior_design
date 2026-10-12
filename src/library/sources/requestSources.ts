// Normalizes either request shape into one list of sources.
//
// The legacy { docUrl, docName } shape stays valid on purpose: the study
// plan's targeted practice, the quiz page's "new questions", the
// useGenerateQuizFromResource hook and the AI regression script all send
// it, and none of them should have to change for this feature.

import { SourceSelectionError } from "./errors";
import type { SourceInput } from "./sourceTypes";

export function sourcesFromBody(body: unknown): SourceInput[] {
  const record = (body ?? {}) as Record<string, unknown>;

  if (Array.isArray(record.sources)) {
    return record.sources.map(toSourceInput).filter((s): s is SourceInput => s !== null);
  }

  if (typeof record.docUrl === "string" && record.docUrl) {
    const docName = typeof record.docName === "string" ? record.docName : "";
    return [
      {
        title: docName || "Document",
        url: record.docUrl,
        fileType: extensionOf(docName),
      },
    ];
  }

  return [];
}

export function countFromBody(body: unknown, max: number, fallback: number): number {
  // Only an absent key means "use the default". An explicit null is a
  // malformed count, not an omission, and is reported like any other.
  const raw = (body as Record<string, unknown> | null)?.count;
  if (raw === undefined) return fallback;
  if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 1 || raw > max) {
    throw new SourceSelectionError(`Choose between 1 and ${max} items.`);
  }
  return raw;
}

function extensionOf(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : "pdf";
}

// Normalizing rather than filtering is deliberate: a note the student can see
// in their notebook must never disappear between the request and the result.
// Note.url and Note.fileType are both optional (notes/types.ts), so an entry
// missing a fileType is completed from its title instead of being dropped, and
// an entry with nothing to read at all is carried through as empty text so
// resolveSources reports it in `skipped`. Only a value that is not a source
// shape at all — a number, a null, an object with no title — is discarded,
// because there is nothing to report it as.
function toSourceInput(value: unknown): SourceInput | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== "string") return null;

  if (typeof v.text === "string") return { title: v.title, text: v.text };

  if (typeof v.url === "string" && v.url) {
    const fileType = typeof v.fileType === "string" && v.fileType ? v.fileType : extensionOf(v.title);
    return typeof v.resourceId === "string" && v.resourceId
      ? { title: v.title, url: v.url, fileType, resourceId: v.resourceId }
      : { title: v.title, url: v.url, fileType };
  }

  return { title: v.title, text: "" };
}
