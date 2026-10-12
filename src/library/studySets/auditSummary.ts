import type { SourceAudit } from '@/src/library/generation/orchestrator';

export interface AuditLine { title: string; produced: number; requested: number; skipped: boolean; }

export function auditSummary(audit: SourceAudit[], skipped: Array<{ title: string; reason: string }> = []): { lines: AuditLine[]; message: string | null } {
  const lines: AuditLine[] = audit.map((row) => ({
    title: row.title, produced: row.produced, requested: row.requested, skipped: row.skippedReason === 'time-budget',
  }));
  const timedOut = audit.filter((row) => row.skippedReason === 'time-budget').map((r) => r.title);
  const empty = audit.filter((row) => row.produced === 0 && row.skippedReason !== 'time-budget').map((r) => r.title);
  const parts: string[] = [];
  if (empty.length) parts.push(`${empty.join(', ')} did not add any items.`);
  if (timedOut.length) parts.push(`${timedOut.join(', ')} ran out of time and was skipped.`);
  if (skipped.length) parts.push(`${skipped.map((r) => r.title).join(', ')} could not be read.`);
  return { lines, message: parts.length ? parts.join(' ') : null };
}
