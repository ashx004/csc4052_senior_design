"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listClasses, subscribeNotebooks, subscribeNotes } from "@/src/library/notes/notesStore";
import type { ClassOption, Note, Notebook } from "@/src/library/notes/types";
import AddNoteChoiceModal from "./AddNoteChoiceModal";
import CreateNoteModal from "./CreateNoteModal";
import NotesUploadModal from "./NotesUploadModal";

/** The + button's flow from a class: choose OCR or typed notes, then either
 *  the upload/scan popup or a titled new note that opens in the Notes tab. */
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
  const [step, setStep] = useState<"choice" | "typed" | "ocr">("choice");
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

  if (step === "choice") return <AddNoteChoiceModal onClose={onClose} onChoose={(c) => setStep(c === "typed" ? "typed" : "ocr")} />;
  if (step === "typed")
    return (
      <CreateNoteModal
        uid={uid}
        classes={classes}
        notebooks={notebooks}
        notes={notes}
        defaultCourseId={courseId}
        onClose={onClose}
        onCreated={(id) => router.push(`/notes/${id}?from=${courseId}`)}
      />
    );
  return (
    <NotesUploadModal
      uid={uid}
      classes={classes}
      defaultCourseId={courseId}
      onClose={onClose}
      onUploaded={() => {
        onUploaded();
        onClose();
      }}
    />
  );
}
