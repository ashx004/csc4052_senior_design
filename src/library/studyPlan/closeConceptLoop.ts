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
    const spot = spotsByKey.get(score.conceptKey);
    if (!spot) continue;

    masteryUpdates.push({ conceptKey: score.conceptKey, percent: score.percent });

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
