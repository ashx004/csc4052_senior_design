// Turns what the student asked the chat to study ("my lecture 3 slides and my
// graphs notes", "the Algorithms notebook") into the source list the shared
// generation engine reads. Pure, so it is unit-tested; the route does the
// Firestore lookups and hands the rows in.

import { noteToMarkdown } from "@/src/library/notes/noteText";
import { MAX_SOURCES } from "@/src/library/sources/resolveSources";
import type { SourceInput } from "@/src/library/sources/sourceTypes";

export interface RequestedSources {
  documentNames: string[];
  noteTitles: string[];
  notebook: string | null;
}

function names(value: unknown): string[] {
  const list = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return list.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean);
}

function unique(list: string[]): string[] {
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = item.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** Reads create_quiz / create_flashcards arguments. The old single `documentName` still works. */
export function requestedSourcesFromArgs(args: Record<string, unknown>): RequestedSources {
  const notebook = typeof args.notebook === "string" && args.notebook.trim() ? args.notebook.trim() : null;
  return {
    documentNames: unique([...names(args.documentName), ...names(args.documentNames)]),
    noteTitles: unique(names(args.noteTitles)),
    notebook,
  };
}

export function hasAnySource(requested: RequestedSources): boolean {
  return requested.documentNames.length > 0 || requested.noteTitles.length > 0 || requested.notebook !== null;
}

type NoteRow = { id: string; data: Record<string, unknown> };

const str = (value: unknown) => (typeof value === "string" ? value : "");

/** A note as a source: a typed note carries its text, a document note its file. */
export function noteRowToSource(row: NoteRow): SourceInput & { noteId: string; typed: boolean } {
  const title = str(row.data.title).trim() || "Untitled note";
  const url = str(row.data.url);
  if (url && row.data.kind !== "typed") {
    const resourceId = str(row.data.resourceId);
    return {
      title,
      url,
      fileType: str(row.data.fileType) || "pdf",
      ...(resourceId ? { resourceId } : {}),
      noteId: row.id,
      typed: false,
    };
  }
  let text = str(row.data.plainText).trim();
  if (!text && row.data.content) {
    try {
      text = noteToMarkdown(row.data.content as never).trim();
    } catch {
      text = "";
    }
  }
  return { title, text, noteId: row.id, typed: true };
}

/** Drops repeats (a note that points at a document also being asked for) and caps at one set's limit. */
export function capSources<T extends SourceInput>(sources: T[]): { kept: T[]; overflow: T[] } {
  return { kept: sources.slice(0, MAX_SOURCES), overflow: sources.slice(MAX_SOURCES) };
}
