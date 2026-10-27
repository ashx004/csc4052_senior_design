import type { AttemptConceptResult } from "./conceptWeakSpotEngine";
import type { QuizQuestionResult } from "./types";

export function attemptConceptResults(
  questions: { id: string; concept?: string }[],
  questionResults: QuizQuestionResult[],
  quizId: string,
  sourceDocKey: string | null,
): AttemptConceptResult[] {
  const conceptById = new Map<string, string | undefined>(
    questions.map((question) => [question.id, question.concept]),
  );
  return questionResults.map((result) => {
    const concept = conceptById.get(result.questionId);
    return {
      questionId: result.questionId,
      quizId,
      conceptLabel: typeof concept === "string" && concept.trim() !== "" ? concept : null,
      sourceDocKey,
      isCorrect: result.isCorrect,
    };
  });
}

export function questionsNeedingNames(results: AttemptConceptResult[]): string[] {
  return results
    .filter((result) => !result.isCorrect && result.conceptLabel === null)
    .map((result) => result.questionId);
}
