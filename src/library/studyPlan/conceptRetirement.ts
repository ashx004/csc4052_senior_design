import type { ConceptWeakSpotStatus } from "./types";

export const RETIREMENT_PERCENT = 80;
export const MIN_SCORED_ITEMS_TO_RETIRE = 3;

export interface ScoredItem {
  conceptKey: string;
  /** Fractional, 0 to 1. */
  score: number;
  /** True when the student used "My answer is correct". */
  selfMarked?: boolean;
}

export interface ConceptScore {
  conceptKey: string;
  itemCount: number;
  machineScoredCount: number;
  percent: number;
}

export type RetirementOutcome = "retire" | "reopen" | "leave_open" | "stay_retired";

export function scoreSessionByConcept(items: ScoredItem[]): ConceptScore[] {
  const groups = new Map<string, { sum: number; itemCount: number; machineScoredCount: number }>();

  for (const item of items) {
    const group = groups.get(item.conceptKey) ?? { sum: 0, itemCount: 0, machineScoredCount: 0 };
    group.sum += item.score;
    group.itemCount += 1;
    if (!item.selfMarked) group.machineScoredCount += 1;
    groups.set(item.conceptKey, group);
  }

  return [...groups.entries()].map(([conceptKey, group]) => ({
    conceptKey,
    itemCount: group.itemCount,
    machineScoredCount: group.machineScoredCount,
    percent: (group.sum / group.itemCount) * 100,
  }));
}

export function retirementOutcome(
  score: ConceptScore,
  current: ConceptWeakSpotStatus,
): RetirementOutcome {
  if (score.machineScoredCount < MIN_SCORED_ITEMS_TO_RETIRE) {
    return current === "retired" ? "stay_retired" : "leave_open";
  }

  const meetsBar = score.percent >= RETIREMENT_PERCENT;
  if (current === "retired") {
    return meetsBar ? "stay_retired" : "reopen";
  }
  return meetsBar ? "retire" : "leave_open";
}
