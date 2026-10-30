import type { ConceptSessionEvidence } from "./conceptMasteryEngine";
import {
  retirementOutcome,
  scoreSessionByConcept,
  type ScoredItem,
} from "./conceptRetirement";
import type { ConceptWeakSpot } from "./types";

export interface FocusedSessionResult {
  sessionId: string;
  courseId: string;
  kind: ConceptSessionEvidence["kind"];
  completedAtMs: number;
  items: ScoredItem[];
}

export function applyFocusedSession(
  weakSpots: ConceptWeakSpot[],
  session: FocusedSessionResult,
): {
  weakSpots: ConceptWeakSpot[];
  /** Every concept the session scored, weak spot or not. */
  masteryUpdates: { conceptKey: string; percent: number }[];
  retired: string[];
  reopened: string[];
} {
  if (session.kind === "flashcards") {
    return { weakSpots, masteryUpdates: [], retired: [], reopened: [] };
  }

  const updated = new Map<string, ConceptWeakSpot>();
  const masteryUpdates: { conceptKey: string; percent: number }[] = [];
  const retired: string[] = [];
  const reopened: string[] = [];
  const spotsByKey = new Map(weakSpots.map((spot) => [spot.conceptKey, spot]));

  for (const score of scoreSessionByConcept(session.items)) {
    // Mastery evidence covers every concept this session scored, not just the ones under
    // weak-spot tracking. A weak spot only ever opens on a miss, so gating mastery on one
    // would mean a concept the student always gets right never records mastery and never
    // records the level it was asked at, leaving the level ladder stuck at its entry rung.
    masteryUpdates.push({ conceptKey: score.conceptKey, percent: score.percent });

    // Retirement and reopening stay gated on an existing weak spot: untracked concepts have
    // nothing to retire.
    const spot = spotsByKey.get(score.conceptKey);
    if (!spot) continue;

    const outcome = retirementOutcome(score, spot.status);
    if (outcome === "retire") {
      updated.set(score.conceptKey, {
        ...spot,
        status: "retired",
        retiredAtMs: session.completedAtMs,
      });
      retired.push(score.conceptKey);
    } else if (outcome === "reopen") {
      updated.set(score.conceptKey, {
        ...spot,
        status: "open",
        retiredAtMs: null,
        timesReopened: spot.timesReopened + 1,
      });
      reopened.push(score.conceptKey);
    }
  }

  return {
    weakSpots: weakSpots.map((spot) => updated.get(spot.conceptKey) ?? spot),
    masteryUpdates,
    retired,
    reopened,
  };
}
