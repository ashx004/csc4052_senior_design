import { describe, expect, it, vi } from 'vitest';

const { getDocs, addDoc, updateDoc, collection, doc } = vi.hoisted(() => ({
  getDocs: vi.fn(async () => ({ docs: [{ id: 's1', data: () => ({ sourceDocKey: 'a' }) }] })),
  addDoc: vi.fn(async () => ({ id: 'new1' })),
  updateDoc: vi.fn(async () => undefined),
  collection: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
  doc: vi.fn((...args: unknown[]) => ({ path: args.slice(1).join('/') })),
}));
vi.mock('firebase/firestore', () => ({
  collection, doc, getDocs, addDoc, updateDoc, serverTimestamp: () => 'ts',
}));

import { liveDeps } from './persistDepsLive';

describe('liveDeps', () => {
  it('lists sets from the course collection and maps docs to id + data', async () => {
    const deps = liveDeps({} as never, 'u1', 'c1');
    const rows = await deps.listSets('flashcardSets');
    expect(rows).toEqual([{ id: 's1', sourceDocKey: 'a' }]);
    expect(collection).toHaveBeenCalledWith({}, 'users', 'u1', 'enrollment', 'c1', 'flashcardSets');
  });

  it('adds and updates through the SDK', async () => {
    const deps = liveDeps({} as never, 'u1', 'c1');
    const id = await deps.addSet('quizSets', { name: 'Q' });
    expect(id).toBe('new1');
    await deps.updateSet('quizSets', 's1', { name: 'Q2' });
    expect(updateDoc).toHaveBeenCalled();
  });
});
