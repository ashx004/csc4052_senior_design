/** Values shared by the local Emulator Suite seed and its test-only route. */
export const LOCAL_E2E_PROJECT_ID = "catalyst-e2e";
export const LOCAL_E2E_STUDENT_UID = "e2e-student";
export const LOCAL_E2E_ADMIN_UID = "e2e-admin";

export const LOCAL_E2E_FIXTURES = {
  courseId: "e2e-course",
  quizId: "e2e-quiz",
  flashcardSetId: "e2e-flashcards",
  practiceSetId: "e2e-practice",
  publicSetId: "e2e-public-set",
  noteId: "e2e-note",
  shareId: "e2e-share",
  customSetId: "e2e-custom-set",
} as const;

export function localE2eEnabled(): boolean {
  return process.env.E2E_LOCAL === "true";
}
