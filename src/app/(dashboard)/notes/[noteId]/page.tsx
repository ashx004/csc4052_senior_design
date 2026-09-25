"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/src/context/AuthContext";
import { listClasses, saveTypedNote, subscribeNotebooks, subscribeNotes } from "@/src/library/notes/notesStore";
import type { ClassOption, Note, Notebook } from "@/src/library/notes/types";
import NoteWorkspace from "@/src/components/notes/NoteWorkspace";
import TypedNoteEditor from "@/src/components/notes/TypedNoteEditor";
import DocumentAnnotator from "@/src/components/notes/DocumentAnnotator";
import CreateNoteModal from "@/src/components/notes/CreateNoteModal";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import noteEditorSteps from "@/src/library/tutorials/steps/note-editor";

const TITLE_SAVE_DELAY_MS = 700;

export default function NotePage() {
  const { noteId } = useParams<{ noteId: string }>();
  const fromCourse = useSearchParams().get("from");
  const router = useRouter();
  const { user, loading } = useAuth();
  const uid = user?.uid;
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [title, setTitle] = useState("");
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [creating, setCreating] = useState(false);
  const titleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadedTitleFor = useRef<string | null>(null);

  useEffect(() => {
    if (!uid) return;
    const offNotes = subscribeNotes(uid, setNotes, (e) => console.error(e));
    const offBooks = subscribeNotebooks(uid, setNotebooks, (e) => console.error(e));
    listClasses(uid).then(setClasses).catch((e) => console.error(e));
    return () => {
      offNotes();
      offBooks();
    };
  }, [uid]);

  const visible = useMemo(() => (notes ?? []).filter((n) => !n.hidden), [notes]);
  const note = visible.find((n) => n.id === noteId) ?? null;

  // Load the title once per note - later snapshots mustn't overwrite what
  // the student is typing into the title field.
  useEffect(() => {
    if (note && loadedTitleFor.current !== note.id) {
      loadedTitleFor.current = note.id;
      setTitle(note.title);
    }
  }, [note]);

  const onTitleChange = useCallback(
    (next: string) => {
      setTitle(next);
      if (!uid) return;
      if (titleTimer.current) clearTimeout(titleTimer.current);
      setSaveState("saving");
      titleTimer.current = setTimeout(() => {
        saveTypedNote(uid, noteId, { title: next.trim() || "Untitled note" })
          .then(() => setSaveState("saved"))
          .catch(() => setSaveState("error"));
      }, TITLE_SAVE_DELAY_MS);
    },
    [uid, noteId]
  );

  if (loading || (uid && notes === null)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-text-muted">
        <Loader2 size={18} className="mr-2 animate-spin" /> Opening note...
      </div>
    );
  }
  if (!uid) return null;
  if (!note) {
    return (
      <div className="mx-auto mt-24 max-w-md px-4 text-center">
        <p className="text-base font-medium text-text-main">This note doesn&apos;t exist anymore.</p>
        <button type="button" onClick={() => router.push(fromCourse ? `/courses/${fromCourse}/notes` : "/notes")} className="mt-4 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover">
          Back to notes
        </button>
      </div>
    );
  }

  return (
    <>
      <PageTutorial id="note-editor" steps={noteEditorSteps} />
      <NoteWorkspace
        note={note}
        notes={visible}
        classes={classes}
        title={title}
        onTitleChange={onTitleChange}
        saveState={saveState}
        allNotesHref={fromCourse ? `/courses/${fromCourse}/notes` : "/notes"}
        onNewNote={() => setCreating(true)}
      >
        {note.kind === "typed" ? (
          <TypedNoteEditor key={note.id} uid={uid} note={note} onSaveStateChange={setSaveState} />
        ) : (
          <DocumentAnnotator key={note.id} uid={uid} note={note} onSaveStateChange={setSaveState} />
        )}
      </NoteWorkspace>
      {creating && (
        <CreateNoteModal
          uid={uid}
          classes={classes}
          notebooks={notebooks}
          notes={visible}
          defaultCourseId={fromCourse ?? note.courseId}
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            router.push(fromCourse ? `/notes/${id}?from=${fromCourse}` : `/notes/${id}`);
          }}
        />
      )}
    </>
  );
}
