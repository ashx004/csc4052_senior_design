// Data model for the Notes system (typed notes, annotatable documents, and
// notebooks). Everything lives under users/{uid}/ - already owner-only in
// firestore.rules, so no rule changes are needed:
//
//   users/{uid}/notes/{noteId}              one Note
//   users/{uid}/notes/{noteId}/pages/{n}    ink/text/stickers for page n
//   users/{uid}/notebooks/{notebookId}      one Notebook
//
// A note belongs to at most one notebook (note.notebookId). Notebooks can
// hold notes from any mix of classes.

export const MAX_NOTES_PER_NOTEBOOK = 150;
export const MAX_PAGES_PER_NOTE = 50;

// Fixed paper size (US Letter at 96dpi). Pages never reflow with the window
// - narrower screens scale the whole sheet down - so ink stays exactly where
// it was drawn relative to the text.
export const PAGE_WIDTH = 816;
export const PAGE_HEIGHT = 1056;

export type NoteKind = "typed" | "document";

export interface Note {
  id: string;
  kind: NoteKind;
  title: string;
  /** Class the note is assigned to; null = not tied to a class. */
  courseId: string | null;
  notebookId: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Typed notes: TipTap document JSON. */
  content?: unknown;
  /** Typed notes: plain text of `content`, for search and AI generation. */
  plainText?: string;
  /** Typed notes: pages the student has explicitly added (for drawing
   *  space below the text). The editor shows at least this many. */
  pageCount?: number;
  /** Document notes: the class resource this note points at. */
  resourceId?: string;
  fileType?: string;
  url?: string;
  /** Derived PDF with the saved annotation layer flattened into it. */
  annotatedUrl?: string | null;
  /** Document notes: "tag" = auto-added because the file is tagged Notes;
   *  "manual" = added from a class with "Add to Notes". */
  source?: "tag" | "manual";
  /** A Notes-tagged document the student removed from the Notes tab. Kept
   *  (hidden) so the automatic sync doesn't add it straight back. */
  hidden?: boolean;
  /** Document notes: an OCR scan (photographed pages plus a transcript). */
  scan?: boolean;
}

export interface Notebook {
  id: string;
  name: string;
  /** Class the notebook was created from, if any - lets an empty notebook
   *  made on a course's Notes tab show up there before it has notes. */
  homeCourseId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type InkTool = "pencil" | "highlighter";
/** "ink" renders in the theme's text color, so pencil writing is always
 *  visible in light and dark mode. Highlighter colors are fixed. */
export type InkColor = "ink" | "yellow" | "green" | "pink";

export interface InkStroke {
  id: string;
  tool: InkTool;
  color: InkColor;
  width: number;
  /** Flat [x0, y0, x1, y1, ...] in page coordinates. */
  points: number[];
}

export interface TextAnnotation {
  id: string;
  x: number;
  y: number;
  text: string;
}

export interface StickerAnnotation {
  id: string;
  x: number;
  y: number;
  emoji: string;
}

export interface PageAnnotations {
  strokes: InkStroke[];
  texts: TextAnnotation[];
  stickers: StickerAnnotation[];
}

export const EMPTY_PAGE: PageAnnotations = { strokes: [], texts: [], stickers: [] };

export interface ClassOption {
  id: string;
  className: string;
  classCode: string;
  /** Enrollment status is kept with the class so Notes can clearly separate
   * material from completed courses without duplicating the status on notes. */
  passed?: boolean;
}
