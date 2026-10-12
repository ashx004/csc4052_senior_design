// How a study set made from a notebook is identified, shared by the notebook
// modal and the chat's create_quiz / create_flashcards so both write the same
// fields. The sets are saved per class like any other.
//
// sourceDocKey stays a synthetic "notebook:<id>" so a notebook's set is found
// again from the notebook; sourceKeys lists the real files behind it, so the
// study plan still sees those documents as covered (see setCoversSource).

import { primaryKeyOf } from "./sourceIdentity";

export function notebookSetFields(notebookId: string, sourceKeys: string[]): {
  sourceDocKey: string;
  sourceNotebookId: string;
  sourceKeys: string[];
} {
  return { sourceDocKey: `notebook:${notebookId}`, sourceNotebookId: notebookId, sourceKeys };
}

/** The identity fields for a set that isn't tied to a notebook. */
export function plainSetFields(sourceKeys: string[]): { sourceDocKey: string | null; sourceKeys: string[] } {
  return { sourceDocKey: sourceKeys.length ? primaryKeyOf(sourceKeys) : null, sourceKeys };
}

/**
 * Every source's key for a saved set: the keys the server resolved plus the
 * synthetic ones for typed notes (note:<id>) and, when nothing resolved to a
 * storage key, for documents (resource:<id>) - the same convention the Learning
 * page uses (completeSourceKeys in buildSourcesPayload).
 */
export function completeKeys(
  serverKeys: string[],
  typedNoteIds: string[],
  documentResourceIds: string[],
): string[] {
  const keys = [...serverKeys, ...typedNoteIds.map((id) => `note:${id}`)];
  if (serverKeys.length === 0) keys.push(...documentResourceIds.map((id) => `resource:${id}`));
  return [...new Set(keys)];
}
