import type { MissedQuestionsSuggestion } from "./types";

export type QuizSuggestionView =
  | { primaryAction: "add" }
  | { primaryAction: "view_task"; taskId: string }
  | { primaryAction: "unavailable" };

type SuggestionViewInput = Pick<
  MissedQuestionsSuggestion,
  "status" | "questionIds" | "linkedTaskId"
> | null;

export function resolvePracticeQuestions<T extends { id: string }>(
  questions: readonly T[],
  target: { mode?: "full" | "missed_questions"; questionIds?: readonly string[] },
): T[] {
  const wanted = new Set(target.questionIds ?? []);
  return questions.filter((question) => wanted.has(question.id));
}

export function resolveQuizSuggestionView(
  suggestion: SuggestionViewInput,
): QuizSuggestionView | null {
  if (!suggestion || suggestion.status === "resolved") return null;
  if (suggestion.status === "unavailable") return { primaryAction: "unavailable" };
  if (suggestion.questionIds.length === 0) return null;
  if (suggestion.linkedTaskId) {
    return { primaryAction: "view_task", taskId: suggestion.linkedTaskId };
  }
  if (suggestion.status === "active") return { primaryAction: "add" };
  return null;
}
