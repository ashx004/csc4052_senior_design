import type {
  CourseMastery,
  DocumentMastery,
  DocumentMasteryCalculation,
  QuizAttemptEvidence,
} from "./types";

const ATTEMPT_WEIGHTS = [1, 0.5, 0.25] as const;

export function classifyMastery(value: number) {
  if (value < 60) return "weak" as const;
  if (value < 80) return "developing" as const;
  return "strong" as const;
}

function answerSetSize(attempt: QuizAttemptEvidence): number {
  return attempt.questionIds.length > 0 ? attempt.questionIds.length : attempt.total;
}

export function isUnambiguousLegacyFullAttempt(
  attempt: QuizAttemptEvidence,
  fullQuizQuestionCount: number | null,
): boolean {
  if (attempt.attemptType !== undefined) return false;
  if (fullQuizQuestionCount == null || fullQuizQuestionCount <= 0) return false;
  return answerSetSize(attempt) === fullQuizQuestionCount;
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function computeDocumentMastery(
  attempts: QuizAttemptEvidence[],
): DocumentMasteryCalculation | null {
  const full = attempts
    .filter((attempt) => attempt.attemptType === "full_quiz" ||
      isUnambiguousLegacyFullAttempt(attempt, attempt.fullQuizQuestionCount))
    .sort((a, b) => b.completedAtMs - a.completedAtMs)
    .slice(0, 3);
  if (full.length === 0) return null;
  const weightTotal = full.reduce((sum, _, index) => sum + ATTEMPT_WEIGHTS[index], 0);
  const raw = full.reduce((sum, attempt, index) =>
    sum + (attempt.total > 0 ? attempt.score / attempt.total : 0) * ATTEMPT_WEIGHTS[index], 0
  ) / weightTotal * 100;
  const value = clampPercent(raw);
  return { value, level: classifyMastery(value), sourceAttemptIds: full.map((a) => a.id) };
}

export function computeCourseMastery(
  documents: DocumentMastery[],
  totalDocuments: number,
): CourseMastery | null {
  if (documents.length === 0) return null;
  const value = documents.reduce((sum, document) => sum + document.value, 0) / documents.length;
  return { value, knownDocuments: documents.length, totalDocuments };
}
