import { describe, expect, it } from 'vitest';
import {
  filterSourceOptions,
  normalizeSourceOptions,
  sourceSelectionNotice,
  toggleSource,
  toggleVisibleSources,
  type SourceOption,
} from './sourceOptions';

describe('source options', () => {
  it('keeps one row when a document note repeats its resource', () => {
    const options = normalizeSourceOptions(
      [{ id: 'r1', name: 'Lecture 1', indexStatus: 'complete' }],
      [{ id: 'n1', title: 'Lecture 1', kind: 'document', courseId: 'bio', resourceId: 'r1' }],
      'bio',
    );
    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: 'r1', kind: 'document', status: 'ready' });
  });

  it('drops notes from other courses and maps real index statuses', () => {
    const options = normalizeSourceOptions(
      [
        { id: 'ready', name: 'Ready', indexStatus: 'complete' },
        { id: 'legacy', name: 'Legacy' },
        { id: 'wait', name: 'Waiting', indexStatus: 'processing' },
        { id: 'bad', name: 'Failed', indexStatus: 'failed' },
      ],
      [{ id: 'other', title: 'Other class', kind: 'typed', courseId: 'chem' }],
      'bio',
    );
    expect(options.map((option) => [option.id, option.status])).toEqual([
      ['ready', 'ready'],
      ['legacy', 'ready'],
      ['wait', 'indexing'],
      ['bad', 'unavailable'],
    ]);
    expect(options.find((option) => option.id === 'bad')?.reason).toBeTruthy();
  });

  it('warns at six sources and stops at ten', () => {
    const eleven = Array.from({ length: 11 }, (_, i): SourceOption => ({
      id: `s${i}`,
      title: `Source ${i}`,
      kind: 'document',
      status: 'ready',
    }));
    expect(toggleSource(['s0', 's1'], 's2', eleven)).toEqual(['s0', 's1', 's2']);
    expect(toggleSource(eleven.slice(0, 10).map((item) => item.id), 's10', eleven)).toHaveLength(10);
    expect(sourceSelectionNotice(5)).toBeNull();
    expect(sourceSelectionNotice(6)).toContain('Six');
    expect(sourceSelectionNotice(10)).toContain('10');
  });

  it('does not select an unavailable source', () => {
    const options: SourceOption[] = [{ id: 'bad', title: 'Broken', kind: 'document', status: 'unavailable', reason: 'failed' }];
    expect(toggleSource([], 'bad', options)).toEqual([]);
  });

  it('filters the visible list without the parent needing to drop a hidden selection', () => {
    const options = normalizeSourceOptions(
      [{ id: 'r1', name: 'Lecture 1', indexStatus: 'complete' }],
      [],
      'bio',
    );
    expect(filterSourceOptions(options, 'missing')).toEqual([]);
    expect(toggleSource(['r1'], 'r1', options)).toEqual([]);
    expect(toggleSource(['r1'], 'missing', options)).toEqual(['r1']);
  });

  it('selects visible eligible sources without clearing a source hidden by search', () => {
    const options: SourceOption[] = [
      { id: 'shown', title: 'Bones', kind: 'document', status: 'ready' },
      { id: 'hidden', title: 'Cells', kind: 'note', status: 'ready' },
      { id: 'blocked', title: 'Bones scan', kind: 'document', status: 'unavailable' },
    ];
    const visible = filterSourceOptions(options, 'bones');
    expect(toggleVisibleSources(['hidden'], visible)).toEqual(['hidden', 'shown']);
    expect(toggleVisibleSources(['hidden', 'shown'], visible)).toEqual(['hidden']);
  });
});
