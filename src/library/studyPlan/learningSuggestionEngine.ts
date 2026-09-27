import type {
  LearningSuggestionStatus,
  MissedQuestionsSuggestion,
  QuizAttemptType,
} from "./types";

export interface MissedQuestionAttemptResult {
  id: string;
  attemptType: QuizAttemptType;
  results: Record<string, boolean>;
  courseId?: string;
  quizId?: string;
  sourceDocKey?: string | null;
}

export function computeSuggestionPriority(suggestion: MissedQuestionsSuggestion): number {
  if (suggestion.status === "resolved" || suggestion.questionIds.length === 0) return 0;
  const repeats = suggestion.questionIds.reduce((sum, questionId) => {
    const failureCount = suggestion.questionFailureCounts[questionId] ?? 0;
    return sum + Math.max(0, failureCount - 1);
  }, 0);
  return suggestion.questionIds.length + 2 * repeats;
}

export function selectPracticeQuestionIds(
  suggestion: MissedQuestionsSuggestion,
  limit = 10,
): string[] {
  return [...suggestion.questionIds]
    .sort((a, b) =>
      (suggestion.questionFailureCounts[b] ?? 0) -
      (suggestion.questionFailureCounts[a] ?? 0)
    )
    .slice(0, limit);
}

export function filterAvailableQuestions(
  suggestion: MissedQuestionsSuggestion,
  availableIds: Set<string>,
): MissedQuestionsSuggestion {
  const referenced = suggestion.questionIds.length > 0;
  const questionIds = suggestion.questionIds.filter((questionId) => availableIds.has(questionId));
  const next: MissedQuestionsSuggestion = {
    ...suggestion,
    questionIds,
    questionFailureCounts: { ...suggestion.questionFailureCounts },
    status: referenced && questionIds.length === 0 ? "unavailable" : suggestion.status,
  };
  next.priority = computeSuggestionPriority(next);
  return next;
}

function nextStatus(
  existing: MissedQuestionsSuggestion | null,
  questionIds: string[],
  addedOrIncremented: boolean,
): LearningSuggestionStatus {
  if (questionIds.length === 0) return "resolved";
  if (!existing || existing.status === "resolved" || existing.status === "unavailable") {
    return "active";
  }
  if (existing.status === "added" && existing.linkedTaskId) return "added";
  if (existing.status === "dismissed") {
    return addedOrIncremented ? "active" : "dismissed";
  }
  return "active";
}

export function reconcileMissedQuestions(
  existing: MissedQuestionsSuggestion | null,
  attempt: MissedQuestionAttemptResult,
): MissedQuestionsSuggestion {
  if (existing && existing.sourceAttemptId === attempt.id) return existing;

  const questionIds = existing ? [...existing.questionIds] : [];
  const questionFailureCounts: Record<string, number> = {
    ...(existing?.questionFailureCounts ?? {}),
  };
  let addedOrIncremented = false;

  for (const [questionId, isCorrect] of Object.entries(attempt.results)) {
    if (isCorrect) {
      const index = questionIds.indexOf(questionId);
      if (index !== -1) questionIds.splice(index, 1);
      continue;
    }
    if (!questionIds.includes(questionId)) questionIds.push(questionId);
    questionFailureCounts[questionId] = (questionFailureCounts[questionId] ?? 0) + 1;
    addedOrIncremented = true;
  }

  const next: MissedQuestionsSuggestion = {
    type: "missed_questions",
    courseId: existing?.courseId ?? attempt.courseId ?? "",
    sourceDocKey: existing ? existing.sourceDocKey : (attempt.sourceDocKey ?? null),
    quizId: existing?.quizId ?? attempt.quizId ?? "",
    questionIds,
    questionFailureCounts,
    status: nextStatus(existing, questionIds, addedOrIncremented),
    priority: 0,
    linkedTaskId: existing?.linkedTaskId ?? null,
    sourceAttemptId: attempt.id,
  };
  next.priority = computeSuggestionPriority(next);
  return next;
}
