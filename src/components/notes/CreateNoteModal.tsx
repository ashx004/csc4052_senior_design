"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createNotebook, createTypedNote } from "@/src/library/notes/notesStore";
import { notebookCourseIds, notebookInCourse } from "@/src/library/notes/noteText";
import { MAX_NOTES_PER_NOTEBOOK, type ClassOption, type Note, type Notebook } from "@/src/library/notes/types";
import ClassSelect, { classLabel } from "./ClassSelect";
import Modal from "./Modal";

const NEW_NOTEBOOK = "__new__";

/** Title, notebook (existing or new) and - only when it can't be worked
 *  out - class for a new typed note. From a class page the note belongs to
 *  that class; a notebook that only holds one class's notes implies it too. */
export default function CreateNoteModal({
  uid,
  classes,
  notebooks,
  notes,
  defaultCourseId,
  defaultNotebookId,
  onCreated,
  onClose,
}: {
  uid: string;
  classes: ClassOption[];
  notebooks: Notebook[];
  notes: Note[];
  defaultCourseId: string | null;
  defaultNotebookId?: string | null;
  onCreated: (noteId: string, courseId: string | null) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [pickedCourseId, setPickedCourseId] = useState("");
  const [notebookId, setNotebookId] = useState(defaultNotebookId ?? "");
  const [newNotebookName, setNewNotebookName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countIn = (id: string) => notes.filter((n) => n.notebookId === id).length;
  const creatingNotebook = notebookId === NEW_NOTEBOOK;

  const chosenBook = notebooks.find((b) => b.id === notebookId);
  const bookCourses = chosenBook ? [...notebookCourseIds(chosenBook.id, notes)].filter((c): c is string => !!c) : [];
  const impliedByNotebook = chosenBook ? (bookCourses.length === 1 ? bookCourses[0] : bookCourses.length === 0 ? chosenBook.homeCourseId : null) : null;
  const inferredCourseId = defaultCourseId || impliedByNotebook || "";
  const courseId = inferredCourseId || pickedCourseId;
  const inferredClass = classes.find((c) => c.id === inferredCourseId);
  // From a class, offer that class's notebooks (plus the one already open).
  const visibleBooks = defaultCourseId
    ? notebooks.filter((b) => b.id === notebookId || notebookInCourse(b, defaultCourseId, notes))
    : notebooks;

  async function create() {
    if (!title.trim()) {
      setError("Give your note a title.");
      return;
    }
    if (creatingNotebook && !newNotebookName.trim()) {
      setError("Name the new notebook.");
      return;
    }
    if (!creatingNotebook && notebookId && countIn(notebookId) >= MAX_NOTES_PER_NOTEBOOK) {
      setError(`That notebook is full (${MAX_NOTES_PER_NOTEBOOK} notes).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const targetNotebook = creatingNotebook ? await createNotebook(uid, newNotebookName, courseId || null) : notebookId || null;
      const id = await createTypedNote(uid, { title, courseId: courseId || null, notebookId: targetNotebook });
      onCreated(id, courseId || null);
    } catch (e) {
      console.error("Failed to create note:", e);
      setError("Couldn't create the note. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Modal title="Take Notes" onClose={onClose} busy={busy}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        className="space-y-4"
      >
        <div>
          <label htmlFor="new-note-title" className="mb-1.5 block text-xs font-medium text-text-muted">
            Title
          </label>
          <input
            id="new-note-title"
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={120}
            placeholder="e.g. Lecture 7 - Binary search trees"
            className="w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
          />
        </div>
        {inferredCourseId ? (
          <p className="text-xs text-text-muted">
            For <span className="font-medium text-text-main">{inferredClass ? classLabel(inferredClass) : "this class"}</span>
          </p>
        ) : (
          <div>
            <label htmlFor="new-note-class" className="mb-1.5 block text-xs font-medium text-text-muted">
              Class
            </label>
            <ClassSelect id="new-note-class" classes={classes} value={pickedCourseId} onChange={setPickedCourseId} allowNone />
          </div>
        )}
        <div>
          <label htmlFor="new-note-notebook" className="mb-1.5 block text-xs font-medium text-text-muted">
            Notebook <span className="font-normal">(optional)</span>
          </label>
          <select
            id="new-note-notebook"
            value={notebookId}
            onChange={(e) => setNotebookId(e.target.value)}
            className="w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
          >
            <option value="">None</option>
            {visibleBooks.map((b) => (
              <option key={b.id} value={b.id} disabled={countIn(b.id) >= MAX_NOTES_PER_NOTEBOOK}>
                {b.name} ({countIn(b.id)}/{MAX_NOTES_PER_NOTEBOOK})
              </option>
            ))}
            <option value={NEW_NOTEBOOK}>+ New notebook...</option>
          </select>
          {creatingNotebook && (
            <input
              autoFocus
              value={newNotebookName}
              onChange={(e) => setNewNotebookName(e.target.value)}
              maxLength={60}
              placeholder="Notebook name, e.g. Midterm 1"
              aria-label="New notebook name"
              className="mt-2 w-full rounded-lg border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main focus:border-primary focus:outline-none"
            />
          )}
        </div>
        {error && <p className="text-xs text-alert-error">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Start writing
        </button>
      </form>
    </Modal>
  );
}
