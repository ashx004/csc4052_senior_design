export type MasteryTone = 'coral' | 'amber' | 'sage' | 'indigo';

export interface MasteryState {
  label: string;
  tone: MasteryTone;
}

export function getMasteryState(score: number | null): MasteryState {
  if (score === null || score < 50) return { label: 'Needs practice', tone: 'coral' };
  if (score < 70) return { label: 'Building momentum', tone: 'amber' };
  if (score < 90) return { label: 'On track', tone: 'sage' };
  return { label: 'Mastered', tone: 'indigo' };
}

export function getMasterySummary(scores: Array<number | null>) {
  const startedScores = scores.filter((score): score is number => score !== null);
  const overall = startedScores.length
    ? Math.round(startedScores.reduce((total, score) => total + score, 0) / startedScores.length)
    : 0;

  return {
    overall,
    started: startedScores.length,
    needsPractice: startedScores.filter((score) => score < 50).length,
    mastered: startedScores.filter((score) => score >= 90).length,
  };
}
