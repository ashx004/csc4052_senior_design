import type { ActivityTarget } from "./types";

/**
 * Longer than the 85-second generation deadline in practice/generation.ts, so a
 * claim only expires once generation genuinely cannot still be running.
 */
export const GENERATION_CLAIM_TTL_MS = 120000;

export type StartDecision =
  | { action: "open_existing"; setId: string }
  | { action: "generate"; claimAtMs: number }
  | { action: "wait" };

export function startDecision(
  target: Extract<ActivityTarget, { kind: "concept_practice" }>,
  nowMs: number,
): StartDecision {
  if (target.generatedSetId) {
    return { action: "open_existing", setId: target.generatedSetId };
  }
  const claimedAt = target.generationClaimedAtMs;
  if (claimedAt !== null && nowMs - claimedAt <= GENERATION_CLAIM_TTL_MS) {
    return { action: "wait" };
  }
  return { action: "generate", claimAtMs: nowMs };
}
