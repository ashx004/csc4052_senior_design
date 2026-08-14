import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "./firebase";

/** Pure: extracts a valid high score from `users/{uid}` doc data, defaulting to 0. */
export function parseHighScore(data: unknown): number {
  if (!data || typeof data !== "object") return 0;
  const value = (data as Record<string, unknown>).blocksHighScore;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return 0;
}

/** Pure: a new score only ever overwrites a strictly lower stored score. */
export function shouldUpdateHighScore(current: number, next: number): boolean {
  return next > current;
}

export async function getBlocksHighScore(uid: string): Promise<number> {
  try {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return 0;
    return parseHighScore(snap.data());
  } catch (error) {
    console.error("Error loading Blocks high score:", error);
    return 0;
  }
}

export async function setBlocksHighScoreIfBeaten(uid: string, score: number): Promise<void> {
  const current = await getBlocksHighScore(uid);
  if (!shouldUpdateHighScore(current, score)) return;

  try {
    await updateDoc(doc(db, "users", uid), { blocksHighScore: score });
  } catch (error) {
    console.error("Error saving Blocks high score:", error);
  }
}
