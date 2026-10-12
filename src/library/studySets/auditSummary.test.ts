import { describe, expect, it } from 'vitest';
import type { SourceAudit } from '@/src/library/generation/orchestrator';
import { auditSummary } from './auditSummary';

const row = (title: string, produced: number, extra: Partial<SourceAudit> = {}): SourceAudit =>
  ({ title, resourceId: null, requested: 4, produced, viaRetrieval: false, ...extra });

describe('auditSummary', () => {
  it('returns no message when every source contributed', () => {
    expect(auditSummary([row('A', 4), row('B', 4)]).message).toBeNull();
  });

  it('names a source that produced nothing', () => {
    const { message } = auditSummary([row('A', 4), row('B', 0)]);
    expect(message).toContain('B');
    expect(message).toContain('did not');
  });

  it('distinguishes a time-budget skip from an empty result', () => {
    const { message } = auditSummary([row('A', 0, { skippedReason: 'time-budget' })]);
    expect(message?.toLowerCase()).toContain('time');
  });

  it('exposes per-line produced/requested for display', () => {
    const { lines } = auditSummary([row('A', 3)]);
    expect(lines[0]).toEqual({ title: 'A', produced: 3, requested: 4, skipped: false });
  });

  it('combines empty and time-budget messages', () => {
    const { message } = auditSummary([row('A', 0), row('B', 0, { skippedReason: 'time-budget' })]);
    expect(message).toContain('did not add any items');
    expect(message).toContain('ran out of time');
  });

  it('reports a source the server dropped before generation, so it is never silent', () => {
    const { message } = auditSummary([row('A', 4)], [{ title: 'Empty note', reason: 'no-text' }]);
    expect(message).toContain('Empty note');
    expect(message).toContain('could not be read');
  });

  it('gives a message even when only skipped sources exist', () => {
    expect(auditSummary([], [{ title: 'N', reason: 'no-text' }]).message).not.toBeNull();
  });
});
