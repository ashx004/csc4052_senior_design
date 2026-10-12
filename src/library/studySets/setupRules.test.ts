import { describe, expect, it } from 'vitest';
import {
  canCreateStudySet,
  coverageMessage,
  coveragePreview,
  liveGeneratorBlock,
  minimumCount,
  MULTI_SOURCE_GENERATION_READY,
  validateStudyConfig,
} from './setupRules';

const quizTypes = { multipleChoice: true, trueFalse: false, matching: false };

describe('study setup rules', () => {
  it('requires four items for every selected source', () => {
    expect(minimumCount(3)).toBe(12);
    expect(validateStudyConfig('quiz', 0, { count: 30, visibility: 'public', questionTypes: quizTypes }).valid).toBe(false);
    expect(validateStudyConfig('quiz', 3, { count: 10, visibility: 'public', questionTypes: quizTypes }).valid).toBe(false);
    expect(validateStudyConfig('quiz', 1, { count: 50, visibility: 'public', questionTypes: quizTypes }).valid).toBe(true);
    expect(validateStudyConfig('flashcards', 1, { count: 30, visibility: 'public' }).valid).toBe(true);
    expect(validateStudyConfig('flashcards', 1, { count: 31, visibility: 'public' }).valid).toBe(false);
  });

  it('requires at least one quiz type and permits multi-source creation when the engine is available', () => {
    expect(validateStudyConfig('quiz', 1, {
      count: 30,
      visibility: 'public',
      questionTypes: { multipleChoice: false, trueFalse: false, matching: false },
    }).valid).toBe(false);
    const validation = validateStudyConfig('quiz', 1, { count: 20, visibility: 'public', questionTypes: quizTypes });
    expect(canCreateStudySet(['lecture-1'], validation, false, MULTI_SOURCE_GENERATION_READY)).toBe(true);
    expect(canCreateStudySet(['a', 'b'], validation, false, MULTI_SOURCE_GENERATION_READY)).toBe(true);
    expect(canCreateStudySet(['lecture-1'], validation, true, true)).toBe(false);
  });

  it('names a skipped source or a source that contributed nothing', () => {
    expect(coverageMessage([{ id: 'lecture-1', count: 4 }], [{ id: 'lecture-1', count: 0 }])).toContain('lecture-1');
    expect(coverageMessage([{ id: 'lecture-1', count: 4 }], [])).toContain('lecture-1');
    expect(coverageMessage([{ id: 'lecture-1', count: 4 }], [{ id: 'lecture-1', count: 4 }])).toBe('');
  });

  it('uses the live multi-source generator and accepts the full quiz range', () => {
    expect(MULTI_SOURCE_GENERATION_READY).toBe(true);
    expect(liveGeneratorBlock('quiz', 2, { count: 12, visibility: 'public', questionTypes: quizTypes })).toBeNull();
    expect(liveGeneratorBlock('quiz', 1, { count: 30, visibility: 'public', questionTypes: quizTypes })).toBeNull();
    expect(coveragePreview(['lecture-1', 'lecture-2'], 8)).toMatchObject({
      rows: [{ id: 'lecture-1', count: 4 }, { id: 'lecture-2', count: 4 }],
    });
  });
});
