import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getEffectiveModelKey } from '@/src/library/chatMode';
import { DEFAULT_QUIZ_DIFFICULTY, type QuizDifficulty } from '@/src/library/quizDifficulty';

export const TARGETED_PRACTICE_QUESTION_COUNT = 10;
export const TARGETED_PRACTICE_QUESTION_TYPES = {
  multipleChoice: true,
  trueFalse: true,
  matching: false,
} as const;

/**
 * Strips a trailing "(new questions)", "(new questions N)" or "(weak-spot practice)" suffix from a quiz name.
 */
export function conceptLabelFromQuizName(name: string): string {
  return name.trim().replace(/\s*\((?:new questions(?: \d+)?|weak-spot practice)\)$/i, '').trim();
}

/**
 * Formats a weak-spot practice quiz name by stripping old suffixes and applying the standard suffix.
 */
export function targetedPracticeName(conceptLabel: string): string {
  const base = conceptLabelFromQuizName(conceptLabel) || 'Weak spot';
  return `${base} (weak-spot practice)`;
}

/**
 * Builds the request body for the targeted practice quiz generation API.
 */
export function buildTargetedPracticeRequest(input: {
  sourceDocKey: string;
  conceptLabel: string;
  avoidQuestions: readonly string[];
  modelKey: string;
}): {
  docUrl: string;
  docName: string;
  questionCount: number;
  questionTypes: typeof TARGETED_PRACTICE_QUESTION_TYPES;
  modelKey: string;
  avoidQuestions: string[];
  difficulty: QuizDifficulty;
} {
  const docName = input.sourceDocKey.split('/').pop()?.replace(/^\d+[-_]/, '') || 'document';
  return {
    docUrl: `/api/download?key=${encodeURIComponent(input.sourceDocKey)}`,
    docName,
    questionCount: TARGETED_PRACTICE_QUESTION_COUNT,
    questionTypes: TARGETED_PRACTICE_QUESTION_TYPES,
    modelKey: input.modelKey,
    avoidQuestions: [...input.avoidQuestions],
    difficulty: DEFAULT_QUIZ_DIFFICULTY,
  };
}

/**
 * Generates a targeted practice quiz and returns the new quiz set document ID.
 */
export async function generateTargetedPracticeQuiz(input: {
  uid: string;
  courseId: string;
  sourceDocKey: string;
  conceptLabel: string;
  avoidQuestions: readonly string[];
}): Promise<string> {
  const { db } = await import('@/src/library/firebase');
  const modelKey = getEffectiveModelKey('quiz');
  const requestBody = buildTargetedPracticeRequest({
    sourceDocKey: input.sourceDocKey,
    conceptLabel: input.conceptLabel,
    avoidQuestions: input.avoidQuestions,
    modelKey,
  });

  const response = await fetch('/api/generate-quiz', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to generate practice questions.');
  }

  const newDoc = await addDoc(
    collection(db, 'users', input.uid, 'enrollment', input.courseId, 'quizSets'),
    {
      name: targetedPracticeName(input.conceptLabel),
      sourceDocKey: input.sourceDocKey,
      questions: data.questions,
      questionTypes: TARGETED_PRACTICE_QUESTION_TYPES,
      difficulty: DEFAULT_QUIZ_DIFFICULTY,
      questionCount: data.questions.length,
      pinned: true,
      visibility: 'private',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
  );

  return newDoc.id;
}
