import type { MissedQuestionsSuggestion } from "./types";

export type QuizSuggestionView =
  | { primaryAction: "add" }
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
  if (!suggestion) return null;
  // Resolved (all missed questions answered) or dismissed -> not shown.
  // A dismissed suggestion reappears only when those questions are missed again
  // (reconcile reactivates it to "active").
  if (suggestion.status === "resolved" || suggestion.status === "dismissed") return null;
  if (suggestion.status === "unavailable") return { primaryAction: "unavailable" };
  if (suggestion.questionIds.length === 0) return null;
  // Still weak on these questions -> keep the card addable, whether or not it has
  // already been added. commitSuggestionTask is idempotent (it reuses the linked
  // active task), so re-adding never creates a duplicate.
  return { primaryAction: "add" };
}

export function isRecommendedSuggestion(
  suggestion: Pick<MissedQuestionsSuggestion, "status" | "questionIds" | "linkedTaskId"> | null,
): boolean {
  if (!suggestion) return false;
  // Show in "Recommended for you" only if:
  // 1. The suggestion would show the "add" action
  // 2. It has not been added yet (status !== "added")
  // 3. It is not linked to an existing task
  const view = resolveQuizSuggestionView(suggestion);
  return (
    view?.primaryAction === "add"
    && suggestion.status !== "added"
    && !suggestion.linkedTaskId
  );
}
