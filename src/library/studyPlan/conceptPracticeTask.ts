import { doc, runTransaction, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { allocateConceptQuotas } from "@/src/library/generation/allocateConceptQuotas";
import type { ConceptFocus } from "@/src/library/generation/conceptFocus";
import { conceptKey } from "./conceptKey";
import { studyTasksCollection } from "./firestorePaths";
import type { ActivityTarget } from "./types";

type ConceptPracticeTarget = Extract<ActivityTarget, { kind: "concept_practice" }>;

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
  target: ConceptPracticeTarget,
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

/**
 * The focus a daily quiz is generated from: the task's concepts split evenly across its
 * question count, each carrying the level the task stored for it. A concept the map does
 * not mention gets no level, so it uses the request's single difficulty.
 */
export function conceptFocusFromTarget(target: ConceptPracticeTarget, avoid: string[]): ConceptFocus {
  const demands = target.conceptKeys.map((key, i) => ({
    conceptKey: key,
    label: target.conceptLabels[i] ?? key,
    missCount: 1,
  }));
  const { quotas } = allocateConceptQuotas(demands, target.questionCount, target.questionCount);
  return {
    quotas: quotas.map((quota) => {
      const level = target.conceptLevels?.[conceptKey(quota.conceptKey)];
      return level ? { ...quota, level } : quota;
    }),
    avoid,
  };
}

function taskRef(uid: string, taskId: string) {
  return doc(db, studyTasksCollection(uid), taskId);
}

/**
 * Takes the right to generate this task's quiz. The claim is re-read and re-judged inside the
 * transaction, so of two openers (two tabs, a double click) only one gets `true`; the other
 * sees the first one's claim and must wait.
 */
export async function claimTaskGeneration(uid: string, taskId: string, claimAtMs: number): Promise<boolean> {
  const ref = taskRef(uid, taskId);
  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const target = snap.exists() ? (snap.data()?.activityTarget as ActivityTarget | undefined) : undefined;
    if (!target || target.kind !== "concept_practice") return false;
    const decision = startDecision(target, claimAtMs);
    if (decision.action !== "generate") return false;
    transaction.update(ref, { "activityTarget.generationClaimedAtMs": decision.claimAtMs });
    return true;
  });
}

/** Records the generated set on the task and releases the claim. */
export async function saveGeneratedSetId(uid: string, taskId: string, setId: string): Promise<void> {
  await updateDoc(taskRef(uid, taskId), {
    "activityTarget.generatedSetId": setId,
    "activityTarget.generationClaimedAtMs": null,
  });
}

/**
 * Gives the claim back after a failed generation, so a retry does not wait out the TTL. Only the
 * caller's own claim is cleared: if the claim aged out and another opener took over, theirs stays.
 */
export async function releaseTaskGeneration(uid: string, taskId: string, claimAtMs: number): Promise<void> {
  const ref = taskRef(uid, taskId);
  await runTransaction(db, async (transaction) => {
    const snap = await transaction.get(ref);
    const target = snap.exists() ? (snap.data()?.activityTarget as ActivityTarget | undefined) : undefined;
    if (!target || target.kind !== "concept_practice") return;
    if (target.generationClaimedAtMs !== claimAtMs) return;
    transaction.update(ref, { "activityTarget.generationClaimedAtMs": null });
  });
}
