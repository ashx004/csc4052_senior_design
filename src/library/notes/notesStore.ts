// Firestore access for the Notes system. See types.ts for the data layout.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { notebookRoom } from "./noteText";
import {
  EMPTY_PAGE,
  MAX_NOTES_PER_NOTEBOOK,
  type ClassOption,
  type Note,
  type Notebook,
  type PageAnnotations,
} from "./types";

function toDate(value: unknown): Date {
  if (value && typeof (value as { toDate?: () => Date }).toDate === "function") return (value as { toDate: () => Date }).toDate();
  return value instanceof Date ? value : new Date();
}

function toNote(id: string, d: DocumentData): Note {
  return {
    id,
    kind: d.kind === "document" ? "document" : "typed",
    title: d.title ?? "Untitled note",
    courseId: d.courseId ?? null,
    notebookId: d.notebookId ?? null,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    content: d.content,
    plainText: d.plainText ?? "",
    pageCount: d.pageCount ?? 1,
    resourceId: d.resourceId,
    fileType: d.fileType,
    url: d.url,
    annotatedUrl: d.annotatedUrl,
    source: d.source,
    hidden: d.hidden === true,
    scan: d.scan === true,
  };
}

function toNotebook(id: string, d: DocumentData): Notebook {
  return {
    id,
    name: d.name ?? "Untitled notebook",
    homeCourseId: d.homeCourseId ?? null,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

const notesCol = (uid: string) => collection(db, "users", uid, "notes");
const notebooksCol = (uid: string) => collection(db, "users", uid, "notebooks");
const pagesCol = (uid: string, noteId: string) => collection(db, "users", uid, "notes", noteId, "pages");

export function subscribeNotes(uid: string, onChange: (notes: Note[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(notesCol(uid), orderBy("updatedAt", "desc")),
    (snap) => onChange(snap.docs.map((d) => toNote(d.id, d.data()))),
    (e) => onError?.(e)
  );
}

export function subscribeNotebooks(uid: string, onChange: (books: Notebook[]) => void, onError?: (e: Error) => void): Unsubscribe {
  return onSnapshot(
    query(notebooksCol(uid), orderBy("name")),
    (snap) => onChange(snap.docs.map((d) => toNotebook(d.id, d.data()))),
    (e) => onError?.(e)
  );
}

export async function getNote(uid: string, noteId: string): Promise<Note | null> {
  const snap = await getDoc(doc(db, "users", uid, "notes", noteId));
  return snap.exists() ? toNote(snap.id, snap.data()) : null;
}

export async function listClasses(uid: string): Promise<ClassOption[]> {
  const snap = await getDocs(collection(db, "users", uid, "enrollment"));
  return snap.docs
    .map((d) => ({ id: d.id, className: d.data().className ?? "", classCode: d.data().classCode ?? "", passed: d.data().status === "completed" }))
    .sort((a, b) => a.classCode.localeCompare(b.classCode));
}

export async function createTypedNote(
  uid: string,
  { title, courseId, notebookId }: { title: string; courseId: string | null; notebookId: string | null }
): Promise<string> {
  const ref = await addDoc(notesCol(uid), {
    kind: "typed",
    title: title.trim() || "Untitled note",
    courseId,
    notebookId,
    content: { type: "doc", content: [{ type: "paragraph" }] },
    plainText: "",
    pageCount: 1,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function saveTypedNote(
  uid: string,
  noteId: string,
  fields: Partial<Pick<Note, "title" | "content" | "plainText" | "pageCount" | "courseId">>
): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notes", noteId), { ...fields, updatedAt: serverTimestamp() });
}

export async function saveDocumentNote(uid: string, noteId: string, fields: Partial<Pick<Note, "annotatedUrl">>): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notes", noteId), { ...fields, updatedAt: serverTimestamp() });
}

async function deletePages(uid: string, noteId: string) {
  const pages = await getDocs(pagesCol(uid, noteId));
  await Promise.all(pages.docs.map((p) => deleteDoc(p.ref)));
}

/** Typed notes are deleted outright. Document notes only leave the Notes
 *  tab (with their annotations) - the file itself stays in its class.
 *  Auto-added (Notes-tagged) documents are hidden rather than deleted, or
 *  the next sync would add them right back. */
export async function removeNotes(uid: string, notes: Pick<Note, "id" | "kind" | "source">[]): Promise<void> {
  await Promise.all(
    notes.map(async (n) => {
      await deletePages(uid, n.id);
      const ref = doc(db, "users", uid, "notes", n.id);
      if (n.kind === "document" && n.source === "tag") await updateDoc(ref, { hidden: true, notebookId: null });
      else await deleteDoc(ref);
    })
  );
}

/** Stale entries (file deleted or re-tagged) are removed for good. */
async function deleteEntries(uid: string, ids: string[]): Promise<void> {
  await Promise.all(
    ids.map(async (id) => {
      await deletePages(uid, id);
      await deleteDoc(doc(db, "users", uid, "notes", id));
    })
  );
}

export class NotebookFullError extends Error {
  constructor(public readonly after: number) {
    super(`A notebook can hold up to ${MAX_NOTES_PER_NOTEBOOK} notes - this would make ${after}.`);
  }
}

/** Moves notes into a notebook (or out of any, with null). Refuses the whole
 *  move if it would take the notebook past 150 notes. */
export async function moveNotesToNotebook(uid: string, noteIds: string[], notebookId: string | null, allNotes: Note[]): Promise<void> {
  if (notebookId) {
    const room = notebookRoom(notebookId, noteIds, allNotes, MAX_NOTES_PER_NOTEBOOK);
    if (!room.fits) throw new NotebookFullError(room.after);
  }
  const batch = writeBatch(db);
  noteIds.forEach((id) => batch.update(doc(db, "users", uid, "notes", id), { notebookId, updatedAt: serverTimestamp() }));
  if (notebookId) batch.update(doc(db, "users", uid, "notebooks", notebookId), { updatedAt: serverTimestamp() });
  await batch.commit();
}

export async function createNotebook(uid: string, name: string, homeCourseId: string | null): Promise<string> {
  const ref = await addDoc(notebooksCol(uid), {
    name: name.trim() || "Untitled notebook",
    homeCourseId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

export async function renameNotebook(uid: string, notebookId: string, name: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notebooks", notebookId), { name: name.trim() || "Untitled notebook", updatedAt: serverTimestamp() });
}

/** Deleting a notebook keeps its notes - they just become unfiled. */
export async function deleteNotebook(uid: string, notebookId: string, allNotes: Note[]): Promise<void> {
  const batch = writeBatch(db);
  allNotes
    .filter((n) => n.notebookId === notebookId)
    .forEach((n) => batch.update(doc(db, "users", uid, "notes", n.id), { notebookId: null }));
  batch.delete(doc(db, "users", uid, "notebooks", notebookId));
  await batch.commit();
}

// ── Documents from classes ─────────────────────────────────────────────

/** One Notes entry per class document, so adding twice is a no-op. */
export function documentNoteId(courseId: string, resourceId: string): string {
  return `doc_${courseId}_${resourceId}`;
}

export interface ResourceSummary {
  id: string;
  name: string;
  fileType: string;
  url: string;
  category?: string;
  /** "ocr_document" for scans (their file is a transcript; the pages are
   *  images). */
  resourceKind?: string;
  /** When the file was uploaded - auto-added entries use it so they sort by
   *  their real age instead of all looking "just now". */
  uploadedAt?: unknown;
}

export async function addResourceToNotes(
  uid: string,
  courseId: string,
  resource: ResourceSummary,
  source: "tag" | "manual" = "manual"
): Promise<string> {
  const id = documentNoteId(courseId, resource.id);
  const ref = doc(db, "users", uid, "notes", id);
  const existing = await getDoc(ref);
  if (existing.exists()) {
    // Adding by hand promotes an auto-added entry to manual (so it stays even
    // if the tag changes) and brings back one that was removed earlier.
    if (source === "manual" && (existing.data().source !== "manual" || existing.data().hidden)) {
      await updateDoc(ref, { source: "manual", hidden: false, updatedAt: serverTimestamp() });
    }
    return id;
  }
  await setDoc(ref, {
    kind: "document",
    title: resource.name,
    courseId,
    notebookId: null,
    resourceId: resource.id,
    fileType: resource.fileType,
    url: resource.url,
    scan: resource.resourceKind === "ocr_document",
    source,
    plainText: "",
    createdAt: resource.uploadedAt ?? serverTimestamp(),
    updatedAt: source === "tag" && resource.uploadedAt ? resource.uploadedAt : serverTimestamp(),
  });
  return id;
}

export async function isResourceInNotes(uid: string, courseId: string, resourceId: string): Promise<boolean> {
  const snap = await getDoc(doc(db, "users", uid, "notes", documentNoteId(courseId, resourceId)));
  return snap.exists() && snap.data().hidden !== true;
}

/** Keeps the Notes tab in step with class documents: every file tagged
 *  Notes appears automatically, and entries whose file was deleted (or,
 *  for auto-added ones, re-tagged away from Notes) are removed. */
export async function syncClassDocuments(uid: string, courseIds: string[], existing: Note[]): Promise<void> {
  for (const courseId of courseIds) {
    const snap = await getDocs(collection(db, "users", uid, "enrollment", courseId, "resources"));
    const resources = new Map(snap.docs.map((d) => [d.id, d.data()]));

    for (const [resourceId, data] of resources) {
      if ((data.category ?? "notes") !== "notes") continue;
      const id = documentNoteId(courseId, resourceId);
      const entry = existing.find((n) => n.id === id);
      const url = data.url ?? "";
      if (!entry) {
        await addResourceToNotes(
          uid,
          courseId,
          { id: resourceId, name: data.name ?? "Untitled", fileType: data.fileType ?? "", url, resourceKind: data.resourceKind, uploadedAt: data.uploadedAt },
          "tag"
        );
      } else {
        const fixes: DocumentData = {};
        // OCR documents get their transcript URL after processing finishes.
        if (entry.url !== url || entry.fileType !== data.fileType) Object.assign(fixes, { url, fileType: data.fileType ?? "" });
        const scan = data.resourceKind === "ocr_document";
        if (Boolean(entry.scan) !== scan) fixes.scan = scan;
        // An auto-added entry nobody has opened or annotated yet (created and
        // updated at the same moment) sorts by the file's upload date.
        const uploaded = data.uploadedAt ? toDate(data.uploadedAt) : null;
        const untouched = Math.abs(entry.updatedAt.getTime() - entry.createdAt.getTime()) < 5000;
        if (entry.source === "tag" && uploaded && untouched && entry.createdAt.getTime() - uploaded.getTime() > 60_000) {
          Object.assign(fixes, { createdAt: data.uploadedAt, updatedAt: data.uploadedAt });
        }
        if (Object.keys(fixes).length) await updateDoc(doc(db, "users", uid, "notes", id), fixes);
      }
    }

    const stale = existing.filter((n) => {
      if (n.kind !== "document" || n.courseId !== courseId || !n.resourceId) return false;
      const data = resources.get(n.resourceId);
      if (!data) return true;
      return n.source === "tag" && (data.category ?? "notes") !== "notes";
    });
    if (stale.length) await deleteEntries(uid, stale.map((n) => n.id));
  }
}

/** The pages a document note is annotated on: its OCR page images, the
 *  image itself, or a PDF (whose pages the viewer renders). */
export async function loadDocumentSource(
  uid: string,
  note: Note
): Promise<{ kind: "images"; urls: string[] } | { kind: "pdf"; url: string } | { kind: "unsupported"; reason: string }> {
  if (!note.courseId || !note.resourceId) return { kind: "unsupported", reason: "This document isn't linked to a class file." };
  const resourceRef = doc(db, "users", uid, "enrollment", note.courseId, "resources", note.resourceId);
  const resource = await getDoc(resourceRef);
  if (!resource.exists()) return { kind: "unsupported", reason: "The original file was deleted from its class." };
  const data = resource.data();
  if (data.resourceKind === "ocr_document") {
    const pages = await getDocs(query(collection(resourceRef, "pages"), orderBy("order")));
    const urls = pages.docs.map((p) => p.data().url as string).filter(Boolean);
    return urls.length ? { kind: "images", urls } : { kind: "unsupported", reason: "This scan has no pages yet." };
  }
  const fileType = String(data.fileType ?? "").toLowerCase();
  if (["png", "jpg", "jpeg", "webp"].includes(fileType)) return { kind: "images", urls: [data.url] };
  if (fileType === "pdf") return { kind: "pdf", url: data.url };
  return { kind: "unsupported", reason: `Annotating .${fileType} files isn't supported - open it from the class instead.` };
}

// ── Per-page drawings and annotations ──────────────────────────────────

export async function loadPages(uid: string, noteId: string): Promise<Record<number, PageAnnotations>> {
  const snap = await getDocs(pagesCol(uid, noteId));
  const out: Record<number, PageAnnotations> = {};
  snap.docs.forEach((d) => {
    const data = d.data();
    out[Number(d.id)] = {
      strokes: data.strokes ?? [],
      texts: data.texts ?? [],
      stickers: data.stickers ?? [],
    };
  });
  return out;
}

export async function savePage(uid: string, noteId: string, pageIndex: number, page: PageAnnotations): Promise<void> {
  const ref = doc(db, "users", uid, "notes", noteId, "pages", String(pageIndex));
  const isEmpty = !page.strokes.length && !page.texts.length && !page.stickers.length;
  if (isEmpty) await deleteDoc(ref);
  else await setDoc(ref, { ...EMPTY_PAGE, ...page, updatedAt: serverTimestamp() });
}

export async function touchNote(uid: string, noteId: string): Promise<void> {
  await updateDoc(doc(db, "users", uid, "notes", noteId), { updatedAt: serverTimestamp() });
}
