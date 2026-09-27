export interface FlashcardSetRef {
  id: string;
  sourceDocKey: string | null;
  createdAt?: number | null;
  updatedAt?: number | null;
}

export type FlashcardNextStep =
  | { action: "open_flashcards"; setId: string }
  | { action: "create_flashcards" };

export interface QuizSetRef {
  id: string;
  sourceDocKey: string | null;
  createdAtMs?: number | null;
}

export type QuizNextStep =
  | { action: "open_quiz"; quizId: string; alternatives: string[] }
  | { action: "create_quiz" };

function recency(set: FlashcardSetRef): number | null {
  const times = [set.createdAt, set.updatedAt].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value),
  );
  return times.length > 0 ? Math.max(...times) : null;
}

export function resolveFlashcardNextStep(
  sourceDocKey: string,
  sets: readonly FlashcardSetRef[],
): FlashcardNextStep {
  const matches = sets.filter((set) => set.sourceDocKey === sourceDocKey);
  if (matches.length === 0) return { action: "create_flashcards" };

  let newest: FlashcardSetRef | null = null;
  let newestAt = -Infinity;
  for (const match of matches) {
    const at = recency(match);
    if (at == null) continue;
    if (newest == null || at > newestAt) {
      newest = match;
      newestAt = at;
    }
  }

  return { action: "open_flashcards", setId: (newest ?? matches[0]).id };
}

function createdAtMs(quiz: QuizSetRef): number | null {
  const at = quiz.createdAtMs;
  return typeof at === "number" && Number.isFinite(at) ? at : null;
}

export function resolveQuizNextStep(
  sourceDocKey: string,
  quizzes: readonly QuizSetRef[],
): QuizNextStep {
  const matches = quizzes.filter((quiz) => quiz.sourceDocKey === sourceDocKey);
  if (matches.length === 0) return { action: "create_quiz" };

  let newest: QuizSetRef | null = null;
  let newestAt = -Infinity;
  for (const match of matches) {
    const at = createdAtMs(match);
    if (at == null) continue;
    if (newest == null || at > newestAt) {
      newest = match;
      newestAt = at;
    }
  }

  const chosen = newest ?? matches[0];
  const alternatives = matches
    .filter((quiz) => quiz.id !== chosen.id)
    .slice()
    .sort((a, b) => (createdAtMs(a) ?? Number.POSITIVE_INFINITY) - (createdAtMs(b) ?? Number.POSITIVE_INFINITY))
    .map((quiz) => quiz.id);

  return { action: "open_quiz", quizId: chosen.id, alternatives };
}
