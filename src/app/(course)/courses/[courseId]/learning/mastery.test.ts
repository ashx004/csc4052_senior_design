import { describe, expect, it } from 'vitest';
import { getMasteryState, getMasterySummary } from './mastery';

describe('course mastery presentation', () => {
  it('maps a mastery score to a student-friendly status', () => {
    expect(getMasteryState(0)).toMatchObject({ label: 'Needs practice', tone: 'coral' });
    expect(getMasteryState(55)).toMatchObject({ label: 'Building momentum', tone: 'amber' });
    expect(getMasteryState(75)).toMatchObject({ label: 'On track', tone: 'sage' });
    expect(getMasteryState(90)).toMatchObject({ label: 'Mastered', tone: 'indigo' });
  });

  it('summarizes course mastery without counting unstarted topics as mastered', () => {
    const summary = getMasterySummary([null, 40, 72, 95]);

    expect(summary).toEqual({
      overall: 69,
      started: 3,
      needsPractice: 1,
      mastered: 1,
    });
  });
});
