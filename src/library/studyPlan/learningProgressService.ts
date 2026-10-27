import { attemptConceptResults } from "./conceptAttemptResults";
import { conceptKey } from "./conceptKey";
import { reconcileConceptWeakSpots } from "./conceptWeakSpotEngine";
import type {
  ApplyQuizOutcomeInput,
  LearningProgressRepository,
  StoredQuizAttempt,
} from "./learningProgressRepository";
import { itemsFromQuizAttempt, planFocusedSession } from "./focusedSessionService";
import { computeDocumentMastery } from "./masteryEngine";
import type {
  ConceptWeakSpot,
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

interface WeakSpotWrites {
  weakSpots: ConceptWeakSpot[];
  conceptSessions: ApplyQuizOutcomeInput["conceptSessions"];
  conceptMastery: ApplyQuizOutcomeInput["conceptMastery"];
}

// Works out every concept write for one attempt without saving any of it. The caller commits
// them in the same transaction that marks the attempt processed, so a failure anywhere leaves
// the attempt pending and nothing written: a retry starts from the same stored counts.
async function conceptWritesForAttempt(
  repo: LearningProgressRepository,
  courseId: string,
  quizId: string,
  attemptId: string,
  sourceDocKey: string | null,
  facts: AttemptFacts,
): Promise<WeakSpotWrites> {
  const concepts = await repo.getQuizQuestionConcepts(courseId, quizId);
  const questions = facts.questionResults.map((result) => ({
    id: result.questionId,
    concept: concepts[result.questionId],
  }));
  const results = attemptConceptResults(questions, facts.questionResults, quizId, sourceDocKey);
  const existing = await repo.conceptWeakSpots.listAll(courseId);
  const reconciled = reconcileConceptWeakSpots(existing, results, Date.now()).map((spot) =>
    existing.includes(spot) ? spot : { ...spot, courseId },
  );

  // Retry Wrong Answers re-asks the exact questions just missed, so getting them right records
  // the misses as cleared but is not evidence the concept is learned: it never retires.
  if (facts.attemptType === "targeted_practice") {
    return {
      weakSpots: reconciled.filter((spot) => !existing.includes(spot)),
      conceptSessions: [],
      conceptMastery: [],
    };
  }

  // Score the same attempt against the reconciled spots, so a concept this attempt just opened
  // can also be retired by its score. This never reconciles misses a second time.
  const plan = await planFocusedSession(repo.conceptWeakSpots, reconciled, {
    sessionId: attemptId,
    courseId,
    kind: "quiz",
    completedAtMs: Date.now(),
    items: itemsFromQuizAttempt(
      questions.map((question) => {
        const label = question.concept;
        return {
          id: question.id,
          conceptKey: typeof label === "string" && label.trim() !== "" ? conceptKey(label) : undefined,
        };
      }),
      facts.questionResults,
    ),
  });
  const retirements = new Map(plan.weakSpots.map((spot) => [spot.conceptKey, spot]));
  const weakSpots = reconciled
    .map((spot) => retirements.get(spot.conceptKey) ?? spot)
    .filter((spot) => !existing.some((before) => before === spot));
  return { weakSpots, conceptSessions: plan.sessions, conceptMastery: plan.mastery };
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
  // Persisted by applyQuizOutcome in the same transaction that marks the attempt processed,
  // so a failed apply writes nothing and a retry starts from the same stored counts.
  const writes = await conceptWritesForAttempt(repo, courseId, quizId, attemptId, sourceDocKey, facts);
  const mastery = sourceDocKey != null ? computeDocumentMastery(evidence) : null;
  await repo.applyQuizOutcome({
    courseId,
    quizId,
    attemptId,
    mastery,
    sourceDocKey,
    conceptWeakSpots: writes.weakSpots,
    conceptSessions: writes.conceptSessions,
    conceptMastery: writes.conceptMastery,
    taskId: facts.taskId,
  });
  return {
    attemptId,
    score: facts.score,
    total: facts.total,
    suggestion: null,
    taskShouldComplete: facts.taskId != null,
  };
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

export interface RecordNamedMissesInput {
  courseId: string;
  quizId: string;
  attemptId: string;
  /** Labels the naming route returned, keyed by question id. */
  labels: Record<string, string>;
}

/**
 * Records misses on untagged questions once they have been named after the attempt was
 * processed. The repository marks the attempt in the same transaction, so a second call for
 * the same attempt writes nothing. Correct answers are left out: they were never named, and
 * this path never scores retirement.
 */
export async function recordNamedMisses(
  repo: LearningProgressRepository,
  input: RecordNamedMissesInput,
): Promise<"recorded" | "already_recorded" | "not_processed" | "nothing_to_record"> {
  const stored = await repo.getQuizAttempt(input.courseId, input.quizId, input.attemptId);
  if (!stored) return "nothing_to_record";
  const misses = stored.questionResults.filter(
    (result) => !result.isCorrect && typeof input.labels[result.questionId] === "string",
  );
  if (misses.length === 0) return "nothing_to_record";
  const context = await repo.getQuizContext(input.courseId, input.quizId);
  const results = attemptConceptResults(
    misses.map((result) => ({ id: result.questionId, concept: input.labels[result.questionId] })),
    misses,
    input.quizId,
    context?.sourceDocKey ?? null,
  );
  const existing = await repo.conceptWeakSpots.listAll(input.courseId);
  const weakSpots = reconcileConceptWeakSpots(existing, results, Date.now())
    .filter((spot) => !existing.includes(spot))
    .map((spot) => ({ ...spot, courseId: input.courseId }));
  if (weakSpots.length === 0) return "nothing_to_record";
  return repo.applyNamedMisses({
    courseId: input.courseId,
    quizId: input.quizId,
    attemptId: input.attemptId,
    weakSpots,
  });
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
