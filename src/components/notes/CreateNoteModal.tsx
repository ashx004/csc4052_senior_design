"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { createTypedNote } from "@/src/library/notes/notesStore";
import { MAX_NOTES_PER_NOTEBOOK, type ClassOption, type Note, type Notebook } from "@/src/library/notes/types";
import ClassSelect from "./ClassSelect";
import Modal from "./Modal";

/** Title, class and (optionally) notebook for a new typed note. */
export default function CreateNoteModal({
  uid,
  classes,
  notebooks,
  notes,
  defaultCourseId,
  defaultNotebookId,
  lockCourse = false,
  onCreated,
  onClose,
}: {
  uid: string;
  classes: ClassOption[];
  notebooks: Notebook[];
  notes: Note[];
  defaultCourseId: string | null;
  defaultNotebookId?: string | null;
  lockCourse?: boolean;
  onCreated: (noteId: string) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState(defaultCourseId ?? "");
  const [notebookId, setNotebookId] = useState(defaultNotebookId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const countIn = (id: string) => notes.filter((n) => n.notebookId === id).length;

  async function create() {
    if (!title.trim()) {
      setError("Give your note a title.");
      return;
    }
    if (notebookId && countIn(notebookId) >= MAX_NOTES_PER_NOTEBOOK) {
      setError(`That notebook is full (${MAX_NOTES_PER_NOTEBOOK} notes).`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const id = await createTypedNote(uid, { title, courseId: courseId || null, notebookId: notebookId || null });
      onCreated(id);
    } catch (e) {
      console.error("Failed to create note:", e);
      setError("Couldn't create the note. Check your connection and try again.");
      setBusy(false);
    }
  }

  return (
    <Modal title="New typed note" onClose={onClose} busy={busy}>
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
        <div>
          <label htmlFor="new-note-class" className="mb-1.5 block text-xs font-medium text-text-muted">
            Class
          </label>
          <ClassSelect id="new-note-class" classes={classes} value={courseId} onChange={setCourseId} allowNone disabled={lockCourse} />
        </div>
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
            {notebooks.map((b) => (
              <option key={b.id} value={b.id} disabled={countIn(b.id) >= MAX_NOTES_PER_NOTEBOOK}>
                {b.name} ({countIn(b.id)}/{MAX_NOTES_PER_NOTEBOOK})
              </option>
            ))}
          </select>
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
