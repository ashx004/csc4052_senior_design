export function resolveLegacyFlashcardQuery(courseId: string, params: URLSearchParams): string | null {
  const setId = params.get('setId');
  if (!setId) return null;
  const path = studySetRoutes(courseId).flashcard(setId);
  const taskId = params.get('taskId');
  return taskId ? `${path}?taskId=${encodeURIComponent(taskId)}` : path;
}

export const studySetRoutes = (courseId: string) => {
  const base = `/courses/${encodeURIComponent(courseId)}`;
  return {
    hub: `${base}/learning`,
    flashcards: `${base}/flashcards`,
    flashcard: (setId: string) => `${base}/flashcards/${encodeURIComponent(setId)}`,
    quizzes: `${base}/quizzes`,
    quiz: (quizId: string) => `${base}/quizzes/${encodeURIComponent(quizId)}`,
  };
};
