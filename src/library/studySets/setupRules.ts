import type { StudySetVisibility } from '@/src/library/discover/types';
import type { QuizDifficulty } from '@/src/library/quizDifficulty';

export const PER_SOURCE_ITEM_FLOOR = 4;
/** Live `/api/generate-quiz` rejects counts outside this range. */
export const LIVE_QUIZ_COUNT_MAX = 20;

export type StudyKind = 'quiz' | 'flashcards';

export interface StudyQuestionTypes {
  multipleChoice: boolean;
  trueFalse: boolean;
  matching: boolean;
}

export interface StudyConfig {
  count: number;
  visibility: StudySetVisibility;
  questionTypes?: StudyQuestionTypes;
  difficulty?: QuizDifficulty;
}

export interface CoverageRow {
  id: string;
  count: number;
}

export interface StudyValidation {
  valid: boolean;
  minimum: number;
  message?: string;
}

/**
 * Story 1A is not on this branch. The quiz and flashcard routes do not accept
 * `sources[]` plus a coverage audit, and the notebook generator only concatenates
 * text. Multi-source Create stays off until that contract exists.
 */
export const MULTI_SOURCE_GENERATION_READY = false;

export function minimumCount(sourceCount: number): number {
  return PER_SOURCE_ITEM_FLOOR * Math.max(0, sourceCount);
}

export function validateStudyConfig(kind: StudyKind, sourceCount: number, config: StudyConfig): StudyValidation {
  const minimum = minimumCount(sourceCount);
  const max = kind === 'quiz' ? 50 : 30;
  if (sourceCount < 1) {
    return { valid: false, minimum, message: 'Choose at least one source.' };
  }
  if (!Number.isInteger(config.count) || config.count < 1 || config.count > max) {
    return { valid: false, minimum, message: kind === 'quiz' ? 'Choose 1 to 50 questions.' : 'Choose 1 to 30 cards.' };
  }
  if (config.count < minimum) {
    return {
      valid: false,
      minimum,
      message: `This set needs at least ${minimum} items for ${sourceCount} ${sourceCount === 1 ? 'source' : 'sources'}.`,
    };
  }
  if (kind === 'quiz') {
    const types = config.questionTypes;
    if (!types?.multipleChoice && !types?.trueFalse && !types?.matching) {
      return { valid: false, minimum, message: 'Choose at least one question type.' };
    }
  }
  return { valid: true, minimum };
}

export function liveGeneratorBlock(kind: StudyKind, sourceCount: number, config: StudyConfig): string | null {
  if (sourceCount > 1 && !MULTI_SOURCE_GENERATION_READY) {
    return 'Creating from several sources is not available yet. Choose one document to continue.';
  }
  if (kind === 'quiz' && config.count > LIVE_QUIZ_COUNT_MAX) {
    return 'The current quiz generator accepts 1 to 20 questions. Lower the count to create this quiz now.';
  }
  if (kind === 'flashcards') {
    return null;
  }
  return null;
}

export function coverageMessage(expected: CoverageRow[], actual: CoverageRow[]): string {
  const actualCounts = new Map(actual.map((row) => [row.id, row.count]));
  const missing = expected.filter((row) => (actualCounts.get(row.id) ?? 0) === 0);
  if (missing.length === 0) return '';
  const names = missing.map((row) => row.id).join(', ');
  return `These sources did not contribute items: ${names}.`;
}

export function canCreateStudySet(
  ids: string[],
  validation: { valid: boolean },
  loading: boolean,
  multiSourceReady: boolean,
): boolean {
  return ids.length > 0 && validation.valid && !loading && (ids.length === 1 || multiSourceReady);
}

/** Floor only. Length-based remainder split belongs to Story 1A and is not invented here. */
export function coveragePreview(ids: string[], count: number): { rows: CoverageRow[]; note: string } | { message: string } {
  const minimum = minimumCount(ids.length);
  if (ids.length === 0) return { message: 'Choose at least one source.' };
  if (count < minimum) return { message: `Raise the count to at least ${minimum}, or choose fewer sources.` };
  return {
    rows: ids.map((id) => ({ id, count: PER_SOURCE_ITEM_FLOOR })),
    note: `Each source needs at least ${PER_SOURCE_ITEM_FLOOR} items. Any items above that floor are split by document length when multi-source generation is connected.`,
  };
}
