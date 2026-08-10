// src/library/discover/blocksSounds.ts
export type BlocksSoundName = "move" | "place" | "correct";

const SOUND_FILES: Record<BlocksSoundName, string> = {
  move: "/sounds/blocks/click.mp3",
  place: "/sounds/blocks/drop.mp3",
  correct: "/sounds/blocks/correct.mp3",
};

const audioCache = new Map<BlocksSoundName, HTMLAudioElement>();

/**
 * Plays a Blocks sound effect. No-ops silently (no throw) if:
 * - called during SSR (no `window`/`Audio`),
 * - the audio file 404s or fails to construct,
 * - the browser blocks playback (e.g. autoplay policy rejects the promise).
 * Each call clones the cached base element so rapid overlapping triggers
 * (move then place in quick succession) don't cut each other off.
 */
export function playSound(name: BlocksSoundName): void {
  if (typeof window === "undefined" || typeof Audio === "undefined") return;

  try {
    let base = audioCache.get(name);
    if (!base) {
      base = new Audio(SOUND_FILES[name]);
      audioCache.set(name, base);
    }
    const clone = base.cloneNode(true) as HTMLAudioElement;
    clone.play()?.catch(() => {
      // Autoplay restrictions or a missing/corrupt file — no-op.
    });
  } catch {
    // Audio unsupported or construction failed — no-op.
  }
}

export const playMove = () => playSound("move");
export const playPlace = () => playSound("place");
export const playCorrect = () => playSound("correct");
