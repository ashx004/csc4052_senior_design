import { describe, expect, it } from 'vitest';
import { findAppendTarget, persistStudySet, type PersistDeps } from './persistStudySet';

describe('findAppendTarget', () => {
  it('appends to a set built from exactly the same sources', () => {
    const existing = [{ id: 'set-1', sourceDocKey: 'a', sourceKeys: ['a', 'b'] }];
    expect(findAppendTarget(existing, ['b', 'a'])).toBe('set-1'); // order-independent
  });

  it('does NOT append when a set shares the primary key but differs in full set', () => {
    const existing = [{ id: 'set-1', sourceDocKey: 'a', sourceKeys: ['a', 'b'] }];
    expect(findAppendTarget(existing, ['a', 'c'])).toBeNull();
  });

  it('creates (null) for a subset or superset of an existing set', () => {
    const existing = [{ id: 'set-1', sourceDocKey: 'a', sourceKeys: ['a', 'b'] }];
    expect(findAppendTarget(existing, ['a'])).toBeNull();
    expect(findAppendTarget(existing, ['a', 'b', 'c'])).toBeNull();
  });

  it('matches a legacy set that has only sourceDocKey and no sourceKeys', () => {
    const existing = [{ id: 'legacy', sourceDocKey: 'a', sourceKeys: null }];
    expect(findAppendTarget(existing, ['a'])).toBe('legacy');
  });

  it('returns null when nothing matches', () => {
    expect(findAppendTarget([], ['a'])).toBeNull();
  });
});

function fakeDeps() {
  const store: Record<string, Record<string, unknown>> = {};
  let n = 0;
  const reads: string[] = [];
  const deps = {
    uid: 'u1',
    courseId: 'c1',
    listSets: async (collectionName: string) => {
      reads.push(collectionName);
      return Object.entries(store)
        .filter(([id]) => id.startsWith(collectionName))
        .map(([id, data]) => ({ id, ...data }));
    },
    addSet: async (collectionName: string, data: Record<string, unknown>) => {
      const id = `${collectionName}:new${n++}`;
      store[id] = data;
      return id;
    },
    updateSet: async (_collectionName: string, id: string, data: Record<string, unknown>) => {
      store[id] = { ...store[id], ...data };
    },
  } as unknown as PersistDeps;
  return { deps, store };
}

describe('persistStudySet', () => {
  it('creates a new flashcard set when none matches', async () => {
    const { deps, store } = fakeDeps();
    const res = await persistStudySet(deps, {
      kind: 'flashcards', sourceKeys: ['a', 'b'], name: 'Deck', items: [{ q: 1 }], visibility: 'public',
    });
    expect(res.appended).toBe(false);
    const saved = store[res.setId];
    expect(saved.sourceDocKey).toBe('a');
    expect(saved.sourceKeys).toEqual(['a', 'b']);
    expect(saved.cards).toEqual([{ q: 1 }]);
  });

  it('appends items to an existing set built from the same sources, keeping name and growing cards', async () => {
    const { deps, store } = fakeDeps();
    const first = await persistStudySet(deps, {
      kind: 'flashcards', sourceKeys: ['a'], name: 'Original', items: [{ q: 1 }], visibility: 'public',
    });
    const second = await persistStudySet(deps, {
      kind: 'flashcards', sourceKeys: ['a'], name: 'Ignored On Append', items: [{ q: 2 }], visibility: 'private',
    });
    expect(second.appended).toBe(true);
    expect(second.setId).toBe(first.setId);
    expect(store[first.setId].name).toBe('Original');
    expect(store[first.setId].cards).toEqual([{ q: 1 }, { q: 2 }]);
  });

  it('writes questions and quiz fields for a quiz kind', async () => {
    const { deps, store } = fakeDeps();
    const res = await persistStudySet(deps, {
      kind: 'quiz', sourceKeys: ['a'], name: 'Quiz', items: [{ q: 1 }], visibility: 'public',
      questionTypes: { multipleChoice: true, trueFalse: false, matching: false }, difficulty: 'exam',
    });
    const saved = store[res.setId];
    expect(saved.questions).toEqual([{ q: 1 }]);
    expect(saved.questionCount).toBe(1);
    expect(saved.difficulty).toBe('exam');
  });
});

describe('append key for a doc versus a doc plus a typed note', () => {
  it('does not append into the doc-only set', () => {
    const existing = [{ id: 's1', sourceDocKey: 'k1', sourceKeys: ['k1'] }];
    expect(findAppendTarget(existing, ['k1', 'note:n2'])).toBeNull();
    expect(findAppendTarget(existing, ['k1'])).toBe('s1');
  });
});
