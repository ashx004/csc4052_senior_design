import type { SignalType } from "./types";

const WEIGHTS = [1.0, 0.5, 0.25];
const MIN_CARD_TIME_MS = 5000;

export function computeQuizMastery(
  attempts: { score: number; total: number }[]
): number {
  if (attempts.length === 0) return 0;

  const recent = attempts.slice(0, 3);
  let weightedSum = 0;
  let weightTotal = 0;

  for (let i = 0; i < recent.length; i++) {
    const { score, total } = recent[i];
    const ratio = total > 0 ? score / total : 0;
    const weight = WEIGHTS[i];
    weightedSum += weight * ratio;
    weightTotal += weight;
  }

  return weightTotal > 0 ? weightedSum / weightTotal : 0;
}

export function isCardValid(card: {
  flipped: boolean;
  timeOnCardMs: number;
}): boolean {
  return card.flipped && card.timeOnCardMs >= MIN_CARD_TIME_MS;
}

export function computeFlashcardEngagement(
  cards: { flipped: boolean; timeOnCardMs: number }[],
  totalCards: number
): number {
  if (totalCards === 0) return 0;
  const validCount = cards.filter(isCardValid).length;
  return validCount / totalCards;
}

export function buildMasterySignalId(
  courseId: string,
  topicLabel: string,
  signalType: SignalType
): string {
  return `${courseId}_${topicLabel}_${signalType}`;
}
