"use client";

import { useParams } from "next/navigation";
import NotesLibrary from "@/src/components/notes/NotesLibrary";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import notesSteps from "@/src/library/tutorials/steps/notes";

/** A class's own Notes tab: that class's notes, and notebooks whose notes
 *  all come from this class. */
export default function CourseNotesPage() {
  const { courseId } = useParams<{ courseId: string }>();
  return (
    <>
      <PageTutorial id="notes" steps={notesSteps} />
      <NotesLibrary courseId={courseId} />
    </>
  );
}
