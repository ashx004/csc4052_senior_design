"use client";

import { useSetPageContext } from "@/src/context/AIPageContext";
import PageTutorial from "@/src/components/tutorial/PageTutorial";
import NotesLibrary from "@/src/components/notes/NotesLibrary";
import notesSteps from "@/src/library/tutorials/steps/notes";

/** General Notes tab: every note across classes, with a dropdown to narrow
 *  to one class. Each class also has its own Notes tab (course sidebar). */
export default function NotesPage() {
  useSetPageContext(
    {
      page: "notes",
      label: "Notes",
      summary:
        "The student is on their Notes page: typed notes (with headings, drawing and highlighting), scanned/uploaded note documents they can annotate, and notebooks that group notes across classes. They can generate flashcards or quizzes from a notebook.",
      data: {},
    },
    []
  );

  return (
    <>
      <PageTutorial id="notes" steps={notesSteps} />
      <NotesLibrary courseId={null} />
    </>
  );
}
