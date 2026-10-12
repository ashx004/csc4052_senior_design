import { describe, expect, it } from 'vitest';
import { buildSourcesPayload, completeSourceKeys } from './buildSourcesPayload';

const opt = (id: string, kind: 'document' | 'note', resourceId?: string) =>
  ({ id, title: `T-${id}`, kind, resourceId, status: 'ready' as const });

describe('buildSourcesPayload', () => {
  it('maps a document option to a url source carrying its resourceId so retrieval engages', () => {
    const out = buildSourcesPayload(
      [opt('d1', 'document', 'd1')],
      [{ id: 'd1', name: 'Lecture 1', url: 'https://x/?key=k1' }],
      [],
    );
    expect(out).toEqual([{ title: 'Lecture 1', url: 'https://x/?key=k1', fileType: 'pdf', resourceId: 'd1' }]);
  });

  it('still sends a note with nothing to read, as empty text, so the server reports it as skipped', () => {
    const out = buildSourcesPayload([opt('n1', 'note', 'd9')], [], [{ id: 'n1', title: 'My note', resourceId: 'd9' }]);
    expect(out).toEqual([{ title: 'My note', text: '' }]);
  });

  it('skips a picked id that resolves to neither a resource nor a note', () => {
    expect(buildSourcesPayload([opt('ghost', 'document')], [], [])).toEqual([]);
  });

  it('sends a document-note with its url so the engine can read it', () => {
    const out = buildSourcesPayload(
      [opt('n1', 'note', 'd9')],
      [],
      [{ id: 'n1', title: 'Scan notes', resourceId: 'd9', url: 'https://x/?key=k9', fileType: 'pdf' }],
    );
    expect(out).toEqual([{ title: 'Scan notes', url: 'https://x/?key=k9', fileType: 'pdf', resourceId: 'd9' }]);
  });

  it('sends a typed note as its plain text', () => {
    const out = buildSourcesPayload(
      [opt('n2', 'note')],
      [],
      [{ id: 'n2', title: 'Typed', plainText: 'Mitosis has four phases.' }],
    );
    expect(out).toEqual([{ title: 'Typed', text: 'Mitosis has four phases.' }]);
  });
});

describe('completeSourceKeys', () => {
  const notes = [
    { id: 'n1', title: 'Doc note', url: 'https://x/?key=k9', resourceId: 'd9' },
    { id: 'n2', title: 'Typed', plainText: 'text' },
  ];

  it('adds a note key for each typed note so {doc} and {doc + typed note} get different keys', () => {
    expect(completeSourceKeys(['k1'], [opt('d1', 'document', 'd1'), opt('n2', 'note')], notes)).toEqual(['k1', 'note:n2']);
  });

  it('adds nothing for a document-note, because its url already gives a storage key', () => {
    expect(completeSourceKeys(['k9'], [opt('n1', 'note', 'd9')], notes)).toEqual(['k9']);
  });

  it('falls back to resource ids in their own namespace when the server returned no storage key', () => {
    expect(completeSourceKeys([], [opt('d1', 'document', 'd1')], notes)).toEqual(['resource:d1']);
  });
});
