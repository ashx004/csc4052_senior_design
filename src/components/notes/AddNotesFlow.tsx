"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listClasses, subscribeNotebooks, subscribeNotes } from "@/src/library/notes/notesStore";
import type { ClassOption, Note, Notebook } from "@/src/library/notes/types";
import AddModal from "./AddModal";

/** The + button on a class page: the unified add window, tied to that class.
 *  A new note opens in the Notes tab; uploads appear in the file list. */
export default function AddNotesFlow({
  uid,
  courseId,
  onClose,
  onUploaded,
}: {
  uid: string;
  courseId: string;
  onClose: () => void;
  onUploaded: () => void;
}) {
  const router = useRouter();
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);

  useEffect(() => {
    listClasses(uid).then(setClasses).catch((e) => console.error(e));
    const offNotes = subscribeNotes(uid, (all) => setNotes(all.filter((n) => !n.hidden)));
    const offBooks = subscribeNotebooks(uid, setNotebooks);
    return () => {
      offNotes();
      offBooks();
    };
  }, [uid]);

  return (
    <AddModal
      uid={uid}
      classes={classes}
      notebooks={notebooks}
      notes={notes}
      defaultCourseId={courseId}
      onClose={onClose}
      onNoteCreated={(id) => router.push(`/notes/${id}?from=${courseId}`)}
      onPartial={onUploaded}
      onUploaded={() => {
        onUploaded();
        onClose();
      }}
    />
  );
}
