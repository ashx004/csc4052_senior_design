// One vocabulary for "what the student picked", shared by the flashcard,
// quiz and notebook generation routes. The shape matches what
// /api/notebooks/generate already accepted so there is a single contract.

/** A typed note carries its text; a document carries a URL to read. */
export type SourceInput =
  | { title: string; text: string }
  | { title: string; url: string; fileType: string; resourceId?: string };

export type ResolvedSource = {
  title: string;
  /** Class resource this came from; null for a typed note. */
  resourceId: string | null;
  /** Storage key, for set identity. Null for a typed note. */
  sourceKey: string | null;
  /** The text actually sent to the model, already inside the budget. */
  text: string;
  /** Pages the text came from, for citation. Empty when unknown. */
  pages: number[];
  /** False when retrieval was unavailable and raw extraction was used. */
  viaRetrieval: boolean;
};

export type SkippedSource = { title: string; reason: string };

export type ResolveResult = {
  sources: ResolvedSource[];
  skipped: SkippedSource[];
};

export function isTextSource(s: SourceInput): s is { title: string; text: string } {
  return typeof (s as { text?: unknown }).text === "string";
}
