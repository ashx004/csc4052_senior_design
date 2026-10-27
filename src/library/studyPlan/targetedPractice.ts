import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { getEffectiveModelKey } from '@/src/library/chatMode';
import type { ConceptFocus } from '@/src/library/generation/conceptFocus';
import { conceptKey } from '@/src/library/studyPlan/conceptKey';
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
 * Names a weak-spot practice set from the concepts it is aimed at.
 */
export function targetedPracticeNameFromFocus(focus: ConceptFocus): string {
  const labels = focus.quotas.map((q) => q.label.trim()).filter(Boolean);
  return targetedPracticeName(labels.join(', '));
}

/**
 * Builds the request body for the targeted practice quiz generation API.
 */
export function buildTargetedPracticeRequest(input: {
  sourceDocKey: string;
  focus: ConceptFocus;
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
  focus: ConceptFocus;
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
    focus: input.focus,
  };
}

/**
 * Generates a targeted practice quiz and returns the new quiz set document ID.
 */
export async function generateTargetedPracticeQuiz(input: {
  uid: string;
  courseId: string;
  sourceDocKey: string;
  /** Aims the quiz at specific concepts. Without it, the quiz targets `conceptLabel` alone. */
  focus?: ConceptFocus;
  /** Fallback name for callers that pass no `focus`. */
  conceptLabel?: string;
  /** Fallback avoid list for callers that pass no `focus`; with a focus, `focus.avoid` is used. */
  avoidQuestions?: readonly string[];
}): Promise<string> {
  const { db } = await import('@/src/library/firebase');
  const modelKey = getEffectiveModelKey('quiz');
  const label = conceptLabelFromQuizName(input.conceptLabel ?? '') || 'Weak spot';
  // A caller's focus is sent as given, and focus.avoid (every question already asked) is the avoid list.
  // conceptLabel and avoidQuestions only back-fill callers that pass no focus.
  const focus: ConceptFocus = input.focus ?? {
    quotas: [{ conceptKey: conceptKey(label), label, items: TARGETED_PRACTICE_QUESTION_COUNT }],
    avoid: [...(input.avoidQuestions ?? [])],
  };
  const requestBody = buildTargetedPracticeRequest({
    sourceDocKey: input.sourceDocKey,
    focus,
    avoidQuestions: focus.avoid,
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
      name: targetedPracticeNameFromFocus(focus),
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
