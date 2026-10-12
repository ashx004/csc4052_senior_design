import type { SourceOption } from './sourceOptions';

export interface RequestSource {
  title: string;
  url?: string;
  text?: string;
  fileType?: string;
  resourceId?: string;
}

function extensionOf(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  return ext && ext !== name.toLowerCase() ? ext : 'pdf';
}

/** The parts of a Note the generation request needs. */
export interface PayloadNote {
  id: string;
  title: string;
  resourceId?: string;
  /** Document notes: the file to read. */
  url?: string;
  fileType?: string;
  /** Typed notes: the note's plain text. */
  plainText?: string;
}

/** Maps picked options + their resource rows into the engine's sources[] body. */
export function buildSourcesPayload(
  selected: SourceOption[],
  resources: Array<{ id: string; name: string; url: string }>,
  notes: PayloadNote[],
): RequestSource[] {
  const out: RequestSource[] = [];
  for (const option of selected) {
    if (option.kind === 'document') {
      const resource = resources.find((r) => r.id === option.id);
      if (!resource?.url) continue;
      out.push({ title: resource.name, url: resource.url, fileType: extensionOf(resource.name), resourceId: resource.id });
    } else {
      const note = notes.find((n) => n.id === option.id);
      if (!note) continue;
      if (note.url) {
        // A document-note is read from its file, like a course document.
        const source: RequestSource = { title: note.title, url: note.url, fileType: note.fileType || extensionOf(note.title) };
        if (note.resourceId) source.resourceId = note.resourceId;
        out.push(source);
      } else {
        // A typed note carries its own text. If it has none, it is still sent
        // so the server reports it in `skipped` instead of it vanishing here.
        out.push({ title: note.title, text: note.plainText ?? '' });
      }
    }
  }
  return out;
}

/**
 * Keys that identify the whole selection when a set is saved or matched.
 * The server only returns storage keys for documents, so a typed note would
 * add nothing and {doc} would collide with {doc + typed note}. Each typed note
 * therefore adds `note:<id>`. If the server returned no storage key at all, we
 * use `resource:<id>` for each document: a separate namespace, so it can never
 * be confused with a real storage key. primaryKeyOf ranks these last.
 */
export function completeSourceKeys(
  serverKeys: string[],
  selected: SourceOption[],
  notes: PayloadNote[],
): string[] {
  const keys = [...serverKeys];
  for (const option of selected) {
    if (option.kind === 'note') {
      const note = notes.find((n) => n.id === option.id);
      if (note && !note.url) keys.push(`note:${note.id}`);
    }
  }
  if (serverKeys.length === 0) {
    for (const option of selected) {
      const isDocument = option.kind === 'document' || notes.find((n) => n.id === option.id)?.url;
      if (isDocument) keys.push(`resource:${option.kind === 'document' ? option.id : (option.resourceId ?? option.id)}`);
    }
  }
  return keys;
}
