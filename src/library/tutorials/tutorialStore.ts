import { doc, getDoc, setDoc, updateDoc, deleteField, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import type { TutorialId } from "./types";

// Per-user tutorial-completion tracking, stored as a single map field on the
// existing users/{uid} doc — already self-read/write only under
// firestore.rules, so no rule changes are needed. A missing key means "not
// seen yet", which is what lets one mechanism cover both new-user onboarding
// (a fresh doc has no map at all) and rolling a new tutorial out to existing
// users (their doc has the map, just not this key) — no backfill migration
// required either way. Mirrors the plain client-SDK read/write pattern
// studentProfile.ts uses for the same users/{uid} doc.
export type TutorialsSeenMap = Partial<Record<TutorialId, boolean>>;

export async function getTutorialsSeen(uid: string): Promise<TutorialsSeenMap> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    const raw = snap.exists() ? snap.data().tutorialsSeen : null;
    if (!raw || typeof raw !== "object") return {};

    const seen: TutorialsSeenMap = {};
    for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
      if (value) seen[key as TutorialId] = true;
    }
    return seen;
  } catch (error) {
    // Fails open toward "show the tutorial" rather than silently hiding it —
    // worse case is a student sees a tour again, not that onboarding
    // guidance never renders because of a transient read error.
    console.error("Failed to load tutorial progress:", error);
    return {};
  }
}

export async function markTutorialSeen(uid: string, id: TutorialId): Promise<void> {
  try {
    await setDoc(
      doc(db, "users", uid),
      { tutorialsSeen: { [id]: serverTimestamp() } },
      { merge: true }
    );
  } catch (error) {
    // Fails open the other way here: worst case the tour reappears next
    // visit, which is mildly annoying but never blocks using the page.
    console.error(`Failed to mark tutorial "${id}" as seen:`, error);
  }
}

/** Backs the Settings "Replay tutorials" control. */
export async function resetTutorials(uid: string, ids: TutorialId[]): Promise<void> {
  const updates: Record<string, ReturnType<typeof deleteField>> = {};
  for (const id of ids) updates[`tutorialsSeen.${id}`] = deleteField();
  try {
    await updateDoc(doc(db, "users", uid), updates);
  } catch (error) {
    console.error("Failed to reset tutorial progress:", error);
  }
}
