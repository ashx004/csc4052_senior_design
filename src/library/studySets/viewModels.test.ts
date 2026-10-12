import { describe, expect, it } from 'vitest';
import { flashcardStatusLabel, quizResultLabel, quizScoreParts, toFlashcardSummary, toQuizSummary } from './viewModels';

describe('saved-set summaries', () => {
  it('keeps missing source metadata and estimates absent while counting empty cards', () => {
    const summary = toFlashcardSummary('f1', { name: 'Atoms', cards: [], createdAt: null });
    expect(summary).toMatchObject({ id: 'f1', name: 'Atoms', cardCount: 0, createdAt: null });
    expect(summary.sourceCount).toBeUndefined();
    expect(summary.estimatedMinutes).toBeUndefined();
    expect(summary.reviewStatus).toBeUndefined();
  });

  it('maps persisted flashcard metadata', () => {
    const summary = toFlashcardSummary('f2', { name: 'Cells', cards: [{}, {}], sourceCount: 2, estimatedMinutes: 4, reviewStatus: 'in_progress', pinned: false, visibility: 'public' });
    expect(summary).toMatchObject({ cardCount: 2, sourceCount: 2, estimatedMinutes: 4, reviewStatus: 'in_progress', pinned: false, visibility: 'public' });
  });

  it('represents an untaken empty quiz without a score', () => {
    const summary = toQuizSummary('q1', { name: 'Bones', questions: [] }, null);
    expect(summary).toMatchObject({ id: 'q1', questionCount: 0, latestAttempt: null });
    expect(summary.sourceCount).toBeUndefined();
  });

  it('preserves the saved attempt total rather than current question count', () => {
    const summary = toQuizSummary('q1', { name: 'Bones', questions: [{}, {}] }, { score: 1, total: 3, completedAt: null });
    expect(summary.questionCount).toBe(2);
    expect(summary.latestAttempt).toEqual({ score: 1, total: 3, completedAt: null });
  });

  it('labels a missing attempt as not taken and keeps a saved zero', () => {
    expect(quizResultLabel(null)).toBe('Not taken');
    expect(quizResultLabel({ score: 18, total: 20, completedAt: null })).toBe('18 / 20 correct');
    expect(quizResultLabel({ score: 0, total: 20, completedAt: null })).toBe('0 / 20 correct');
    expect(toFlashcardSummary('deck', { name: 'Empty deck' }).cardCount).toBe(0);
    expect(flashcardStatusLabel(undefined)).toBe('Flashcards');
    expect(flashcardStatusLabel('in_progress')).toBe('In progress');
    expect(toQuizSummary('q2', { name: 'Bones' }).latestAttemptKnown).toBe(false);
  });

  it('splits a score into a big value and a small label, with no label when untaken', () => {
    expect(quizScoreParts({ score: 18, total: 20, completedAt: null })).toEqual({ value: '18 / 20', label: 'Correct' });
    expect(quizScoreParts({ score: 0, total: 20, completedAt: null })).toEqual({ value: '0 / 20', label: 'Correct' });
    expect(quizScoreParts(null)).toEqual({ value: 'Not taken', label: null });
  });
});
