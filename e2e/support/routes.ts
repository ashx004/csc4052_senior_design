import type { E2eFixtures } from "./fixtures";

export const dashboardRoutes = [
  "/dashboard", "/classes", "/calendar", "/learning", "/learning/classes", "/learning/study-plan",
  "/discover", "/notes", "/notes/ocr", "/ai-assistant", "/advising_new",
  "/profile", "/settings", "/help", "/summary", "/billing", "/custom/new",
];

export function dynamicStudentRoutes(fixture: E2eFixtures) {
  const course = `/courses/${fixture.courseId}`;
  return [
    `/custom/${fixture.customSetId}`,
    `/notes/${fixture.noteId}`,
    course,
    `${course}/assignments`, `${course}/due-dates`, `${course}/learning`,
    `${course}/notes`, `${course}/summaries`, `${course}/quizzes`,
    `${course}/quizzes/${fixture.quizId}`, `${course}/flashcards`,
    `${course}/flashcards/${fixture.flashcardSetId}`, `${course}/practice`,
    `${course}/practice/${fixture.practiceSetId}`, `${course}/discover`,
    `${course}/discover/blocks`, `${course}/discover/${fixture.publicSetId}`,
  ];
}
