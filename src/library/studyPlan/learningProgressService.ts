import { learningSuggestionId } from "./firestorePaths";
import { reconcileMissedQuestions } from "./learningSuggestionEngine";
import type {
  LearningProgressRepository,
  StoredQuizAttempt,
} from "./learningProgressRepository";
import { computeDocumentMastery } from "./masteryEngine";
import type {
  MissedQuestionsSuggestion,
  PendingAttemptRef,
  QuizAttemptType,
  QuizQuestionResult,
} from "./types";

export interface SubmitQuizResultInput {
  courseId: string;
  quizId: string;
  attemptType: "full_quiz" | "targeted_practice";
  taskId: string | null;
  suggestionId: string | null;
  answers: Record<string, string>;
  questions: Array<{ id: string; correctAnswer: string }>;
}

export interface QuizProgressOutcome {
  attemptId: string;
  score: number;
  total: number;
  suggestion: (MissedQuestionsSuggestion & { id: string }) | null;
  taskShouldComplete: boolean;
}

export interface FinishReadingInput {
  courseId: string;
  sourceDocKey: string;
  resourceId: string | null;
  taskId: string | null;
}

export interface FinishFlashcardReviewInput {
  courseId: string;
  sourceDocKey: string;
  flashcardSetId: string | null;
  taskId: string | null;
}

export interface ActivityProgressResult {
  eventId: string;
  courseId: string;
  sourceDocKey: string;
  resourceId: string | null;
  flashcardSetId: string | null;
  taskId: string | null;
}

interface AttemptFacts {
  score: number;
  total: number;
  attemptType: QuizAttemptType;
  questionResults: QuizQuestionResult[];
  taskId: string | null;
  completedAt: number | null;
}

function questionResultsFor(
  questions: SubmitQuizResultInput["questions"],
  answers: Record<string, string>,
): QuizQuestionResult[] {
  return questions.map((question) => ({
    questionId: question.id,
    selectedAnswer: answers[question.id] ?? "",
    correctAnswer: question.correctAnswer,
    isCorrect: answers[question.id] === question.correctAnswer,
  }));
}

function failureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

async function recordFailure(
  repo: LearningProgressRepository,
  courseId: string,
  quizId: string,
  attemptId: string,
  error: unknown,
): Promise<void> {
  try {
    await repo.markAttemptFailed(courseId, quizId, attemptId, failureMessage(error));
  } catch {
    // The saved score is still returned when failure bookkeeping also fails.
  }
}

function failedOutcome(attemptId: string, facts: AttemptFacts | null): QuizProgressOutcome {
  return {
    attemptId,
    score: facts?.score ?? 0,
    total: facts?.total ?? 0,
    suggestion: null,
    taskShouldComplete: facts?.taskId != null,
  };
}

async function deriveAndApply(
  repo: LearningProgressRepository,
  courseId: string,
  quizId: string,
  attemptId: string,
  facts: AttemptFacts,
): Promise<QuizProgressOutcome> {
  const context = await repo.getQuizContext(courseId, quizId);
  const sourceDocKey = context?.sourceDocKey ?? null;
  const evidence =
    sourceDocKey != null ? await repo.listFullAttemptEvidence(courseId, sourceDocKey) : [];
  const existing = await repo.getSuggestion(courseId, quizId);
  const results: Record<string, boolean> = {};
  for (const result of facts.questionResults) {
    results[result.questionId] = result.isCorrect;
  }
  const suggestion = await suggestionAfterAttempt(repo, {
    courseId,
    quizId,
    attemptId,
    attemptType: facts.attemptType,
    results,
    sourceDocKey,
    completedAt: facts.completedAt,
    existing,
  });
  const mastery = sourceDocKey != null ? computeDocumentMastery(evidence) : null;
  const suggestionId = existing?.id ?? learningSuggestionId(courseId, quizId);
  await repo.applyQuizOutcome({
    courseId,
    quizId,
    attemptId,
    mastery,
    suggestion,
    taskId: facts.taskId,
  });
  return {
    attemptId,
    score: facts.score,
    total: facts.total,
    suggestion: { ...suggestion, id: suggestionId },
    taskShouldComplete: facts.taskId != null,
  };
}

function suggestionBody(
  suggestion: MissedQuestionsSuggestion & { id: string },
): MissedQuestionsSuggestion {
  return {
    type: suggestion.type,
    courseId: suggestion.courseId,
    sourceDocKey: suggestion.sourceDocKey,
    quizId: suggestion.quizId,
    questionIds: [...suggestion.questionIds],
    questionFailureCounts: { ...suggestion.questionFailureCounts },
    status: suggestion.status,
    priority: suggestion.priority,
    linkedTaskId: suggestion.linkedTaskId,
    sourceAttemptId: suggestion.sourceAttemptId,
  };
}

async function suggestionAfterAttempt(
  repo: LearningProgressRepository,
  input: {
    courseId: string;
    quizId: string;
    attemptId: string;
    attemptType: QuizAttemptType;
    results: Record<string, boolean>;
    sourceDocKey: string | null;
    completedAt: number | null;
    existing: (MissedQuestionsSuggestion & { id: string }) | null;
  },
): Promise<MissedQuestionsSuggestion> {
  const sourceAttemptId = input.existing?.sourceAttemptId ?? "";
  if (
    input.existing &&
    sourceAttemptId !== "" &&
    sourceAttemptId !== input.attemptId &&
    input.completedAt != null
  ) {
    const sourceAttempt = await repo.getQuizAttempt(
      input.courseId,
      input.quizId,
      sourceAttemptId,
    );
    if (sourceAttempt && sourceAttempt.completedAt > input.completedAt) {
      return suggestionBody(input.existing);
    }
  }
  return reconcileMissedQuestions(input.existing, {
    id: input.attemptId,
    attemptType: input.attemptType,
    results: input.results,
    courseId: input.courseId,
    quizId: input.quizId,
    sourceDocKey: input.sourceDocKey,
  });
}

function factsFromStored(stored: StoredQuizAttempt): AttemptFacts {
  return {
    score: stored.score,
    total: stored.total,
    attemptType: stored.attemptType,
    questionResults: stored.questionResults,
    taskId: stored.taskId,
    completedAt: stored.completedAt,
  };
}

export async function submitQuizResult(
  repo: LearningProgressRepository,
  input: SubmitQuizResultInput,
): Promise<QuizProgressOutcome> {
  const questionResults = questionResultsFor(input.questions, input.answers);
  const facts: AttemptFacts = {
    score: questionResults.filter((result) => result.isCorrect).length,
    total: input.questions.length,
    attemptType: input.attemptType,
    questionResults,
    taskId: input.taskId,
    completedAt: null,
  };
  const attemptId = await repo.createQuizAttempt({
    courseId: input.courseId,
    quizId: input.quizId,
    answers: input.answers,
    score: facts.score,
    total: facts.total,
    attemptType: input.attemptType,
    questionIds: input.questions.map((question) => question.id),
    questionResults,
    sourceTaskId: input.taskId,
    sourceSuggestionId: input.suggestionId,
  });
  try {
    return await deriveAndApply(repo, input.courseId, input.quizId, attemptId, facts);
  } catch (error) {
    await recordFailure(repo, input.courseId, input.quizId, attemptId, error);
    return failedOutcome(attemptId, facts);
  }
}

export async function processSavedAttempt(
  repo: LearningProgressRepository,
  ref: PendingAttemptRef,
): Promise<QuizProgressOutcome> {
  let facts: AttemptFacts | null = null;
  try {
    const stored = await repo.getQuizAttempt(ref.courseId, ref.quizId, ref.attemptId);
    if (!stored) throw new Error("Quiz attempt not found");
    facts = factsFromStored(stored);
    return await deriveAndApply(repo, ref.courseId, ref.quizId, ref.attemptId, facts);
  } catch (error) {
    await recordFailure(repo, ref.courseId, ref.quizId, ref.attemptId, error);
    return failedOutcome(ref.attemptId, facts);
  }
}

export async function retryPendingAttempts(
  repo: LearningProgressRepository,
  limitCount: number,
): Promise<QuizProgressOutcome[]> {
  const pending = await repo.listPendingAttempts(limitCount);
  const outcomes: QuizProgressOutcome[] = [];
  for (const ref of pending) {
    outcomes.push(await processSavedAttempt(repo, ref));
  }
  return outcomes;
}

export async function finishReading(
  repo: LearningProgressRepository,
  input: FinishReadingInput,
): Promise<ActivityProgressResult> {
  const eventId = await repo.recordActivityEvent({
    type: "reading_finished",
    courseId: input.courseId,
    sourceDocKey: input.sourceDocKey,
    resourceId: input.resourceId,
    flashcardSetId: null,
    sourceTaskId: input.taskId,
  });
  return {
    eventId,
    courseId: input.courseId,
    sourceDocKey: input.sourceDocKey,
    resourceId: input.resourceId,
    flashcardSetId: null,
    taskId: input.taskId,
  };
}

export async function finishFlashcardReview(
  repo: LearningProgressRepository,
  input: FinishFlashcardReviewInput,
): Promise<ActivityProgressResult> {
  const eventId = await repo.recordActivityEvent({
    type: "flashcard_review_finished",
    courseId: input.courseId,
    sourceDocKey: input.sourceDocKey,
    resourceId: null,
    flashcardSetId: input.flashcardSetId,
    sourceTaskId: input.taskId,
  });
  return {
    eventId,
    courseId: input.courseId,
    sourceDocKey: input.sourceDocKey,
    resourceId: null,
    flashcardSetId: input.flashcardSetId,
    taskId: input.taskId,
  };
}
