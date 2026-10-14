import type { PageAIContext } from "@/src/library/chatContext";

// What the floating AI panel knows about a page when the page hasn't described
// itself (useSetPageContext). A page that does, with live data such as the
// calendar's events, always wins; this only fills the gaps, so on every screen
// the assistant can answer "what is this page / how do I do X here" and tell
// when a student is stuck. Descriptions stay at the level of what the page is for.
// They never claim specific data, because they can't see it.

type Describe = (course: string) => { label: string; summary: string };
const GENERIC_COURSE = "this class";

const COURSE_PAGES: [RegExp, Describe][] = [
  [/^\/?$/, (c) => ({ label: `${c} overview`, summary: `The overview of ${c}: course details, instructor, syllabus info and key dates, the course summary, and the class documents.` })],
  [/^\/discover$/, (c) => ({ label: `${c} discover`, summary: `Discover for ${c}: make a quiz or flashcards, practice questions drawn from the student's quiz history (once they have some), study sets other students shared for this class, and a study game.` })],
  [/^\/discover\/blocks$/, (c) => ({ label: `${c} study game`, summary: `A block-building study game for ${c}, where answering questions places pieces on a board.` })],
  [/^\/discover\/[^/]+$/, (c) => ({ label: `${c} shared study set`, summary: `A study set another student shared publicly for ${c}, which the student can study.` })],
  [/^\/notes$/, (c) => ({ label: `${c} notes`, summary: `The Notes tab of ${c}: typed notes and uploaded files for this class only, with an OCR tab for scanning photos and PDFs.` })],
  [/^\/practice$/, (c) => ({ label: `${c} practice`, summary: `Practice exams for ${c}: fill-in-the-blank, word-problem and drag-and-drop sets the student can take, and a way to make new ones from class material.` })],
  [/^\/practice\/[^/]+$/, (c) => ({ label: `${c} practice set`, summary: `A single practice exam for ${c} the student is taking or reviewing, with graded written answers.` })],
  [/^\/quizzes$/, (c) => ({ label: `${c} quizzes`, summary: `The list of quizzes for ${c}, with a button to make a new quiz from one or more class files or notes.` })],
  [/^\/flashcards$/, (c) => ({ label: `${c} flashcards`, summary: `The flashcard decks for ${c}, with a button to make a new deck from class files or notes.` })],
  [/^\/assignments$/, (c) => ({ label: `${c} assignments`, summary: `The Assignments page for ${c}. It is a placeholder that hasn't been built yet, so it has nothing to show. Due dates from the syllabus are on the calendar and the course overview.` })],
  [/^\/due-dates$/, (c) => ({ label: `${c} due dates`, summary: `The Due Dates page for ${c}. It is a placeholder that hasn't been built yet. Dates from the syllabus are on the calendar and the course overview.` })],
  [/^\/summaries$/, (c) => ({ label: `${c} summaries`, summary: `The Summaries page for ${c}. It is a placeholder that hasn't been built yet. The AI-written course summary is on the course overview.` })],
];

const SITE_PAGES: [RegExp, { label: string; summary: string }][] = [
  [/^\/dashboard$/, { label: "Home", summary: "The student's home dashboard: an overview of their classes, study plan and recent activity, with shortcuts into the rest of Catalyst." }],
  [/^\/learning$/, { label: "Learning", summary: "The Learning hub across all classes: quizzes, flashcards and practice sets, recent study sets, custom one-off sets, and the study plan." }],
  [/^\/discover$/, { label: "Discover", summary: "Discover: study sets other students have shared publicly, which the student can browse and study." }],
  [/^\/advising_new$/, { label: "Advising", summary: "Advising: the student uploads their transcript and curriculum sheet, Catalyst reads them, tracks progress toward the degree, and can suggest a schedule." }],
  [/^\/settings$/, { label: "Settings", summary: "Settings: appearance, email reminders, connected calendar, sign-in devices that skip the emailed code, and downloading or deleting account data." }],
  [/^\/profile$/, { label: "Profile", summary: "The student's profile and account details." }],
  [/^\/help$/, { label: "Help", summary: "The Help and FAQ page, with answers about using Catalyst." }],
  [/^\/summary$/, { label: "Summary", summary: "The Summary page. It is a placeholder that hasn't been built yet and has nothing to show." }],
  [/^\/custom\/new$/, { label: "Custom set builder", summary: "The builder for a one-off quiz, flashcard deck or practice exam from the student's own prompt and files, with no class attached." }],
  [/^\/custom\/[^/]+$/, { label: "Custom set", summary: "A one-off custom quiz, flashcard deck or practice exam the student is studying." }],
  [/^\/notes\/ocr$/, { label: "OCR", summary: "The OCR tab of Notes: upload photos and PDFs to be scanned into text, and review what has already been scanned." }],
  [/^\/notes\/[^/]+$/, { label: "A note", summary: "A single note open for editing or annotating: typed notes, or an uploaded file with drawing, highlights, stickers and written notes. It can be shared or exported from the Share button." }],
  [/^\/notes$/, { label: "Notes", summary: "Notes across all classes: typed notes, uploaded files, and notebooks that group notes." }],
  [/^\/calendar$/, { label: "Calendar", summary: "The student's calendar with month, week, day and agenda views, class meetings, study blocks and events." }],
  [/^\/classes$/, { label: "Classes", summary: "The student's current classes, which can be added, reordered by dragging, recolored and removed." }],
];

export function describePage(pathname: string | null | undefined, courseName?: string | null): PageAIContext | null {
  if (!pathname) return null;
  const course = pathname.match(/^\/courses\/[^/]+(.*)$/);
  if (course) {
    const rest = course[1].replace(/\/+$/, "");
    const name = courseName?.trim() || GENERIC_COURSE;
    for (const [pattern, describe] of COURSE_PAGES) {
      if (pattern.test(rest)) {
        const { label, summary } = describe(name);
        return { page: "course", label, summary };
      }
    }
    return { page: "course", label: name, summary: `A page inside ${name}.` };
  }
  for (const [pattern, page] of SITE_PAGES) {
    if (pattern.test(pathname)) return { page: pathname, label: page.label, summary: page.summary };
  }
  return null;
}
