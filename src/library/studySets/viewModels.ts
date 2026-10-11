import type { Timestamp } from 'firebase/firestore';
import type { StudySetVisibility } from '@/src/library/discover/types';

interface SavedSetFields {
  name?: string;
  createdAt?: Timestamp | null;
  visibility?: StudySetVisibility;
  pinned?: boolean;
  publicSetId?: string;
  sourceCount?: number;
  sources?: unknown[];
  sourceIds?: unknown[];
}

export interface SavedFlashcardSetFields extends SavedSetFields {
  cards?: unknown[];
  estimatedMinutes?: number;
  reviewStatus?: string;
}

export interface SavedQuizSetFields extends SavedSetFields {
  questions?: unknown[];
}

export interface SavedQuizAttemptFields {
  score: number;
  total: number;
  completedAt?: Timestamp | null;
}

interface StudySetSummary {
  id: string;
  name: string;
  createdAt: Timestamp | null;
  visibility?: StudySetVisibility;
  pinned?: boolean;
  publicSetId?: string;
  sourceCount?: number;
}

export interface FlashcardSetSummary extends StudySetSummary {
  cardCount: number;
  estimatedMinutes?: number;
  reviewStatus?: string;
}

export interface QuizSetSummary extends StudySetSummary {
  questionCount: number;
  latestAttempt: { score: number; total: number; completedAt: Timestamp | null } | null;
  /** False until the latest-attempt listener has answered. */
  latestAttemptKnown: boolean;
}

function sharedFields(id: string, data: SavedSetFields): StudySetSummary {
  return {
    id,
    name: data.name || 'Untitled',
    createdAt: data.createdAt ?? null,
    visibility: data.visibility,
    pinned: data.pinned,
    publicSetId: data.publicSetId,
    sourceCount: typeof data.sourceCount === 'number'
      ? data.sourceCount
      : Array.isArray(data.sources) ? data.sources.length
      : Array.isArray(data.sourceIds) ? data.sourceIds.length
      : undefined,
  };
}

export function toFlashcardSummary(id: string, data: SavedFlashcardSetFields): FlashcardSetSummary {
  return {
    ...sharedFields(id, data),
    cardCount: Array.isArray(data.cards) ? data.cards.length : 0,
    estimatedMinutes: data.estimatedMinutes,
    reviewStatus: data.reviewStatus,
  };
}

export function toQuizSummary(
  id: string,
  data: SavedQuizSetFields,
  attempt?: SavedQuizAttemptFields | null,
): QuizSetSummary {
  const known = arguments.length >= 3;
  return {
    ...sharedFields(id, data),
    questionCount: Array.isArray(data.questions) ? data.questions.length : 0,
    latestAttemptKnown: known,
    latestAttempt: known && attempt
      ? { score: attempt.score, total: attempt.total, completedAt: attempt.completedAt ?? null }
      : null,
  };
}

export function quizResultLabel(attempt: QuizSetSummary['latestAttempt']): string {
  if (!attempt) return 'Not taken';
  return `${attempt.score} / ${attempt.total} correct`;
}

export function flashcardStatusLabel(reviewStatus?: string): string {
  if (reviewStatus === 'new') return 'New';
  if (reviewStatus === 'in_progress') return 'In progress';
  if (reviewStatus === 'reviewed') return 'Reviewed';
  return 'Flashcards';
}
