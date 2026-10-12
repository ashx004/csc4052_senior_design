import type { DragDropItem, DragDropMode, DragTile, DropZone } from "./types";

// Rules for the drag-and-drop rounds: turning the AI's raw pairs / categories /
// steps into tiles and drop zones, where a tile may be dropped, how a round is
// scored, and the clock. Pure, so it is tested without a browser.

export type Rng = () => number;

export function shuffled<T>(items: T[], rng: Rng = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Seconds allowed for a round: a base plus a little per tile, more for harder modes. */
export function timeLimitFor(mode: DragDropMode, tileCount: number): number {
  const perTile = mode === "sequence" ? 10 : 8;
  return Math.min(180, 20 + perTile * tileCount);
}

export const MIN_TILES = 3;
export const MAX_TILES = 10;

const clean = (text: string, max = 120) => text.replace(/\s+/g, " ").trim().slice(0, max);

/** Tiles in a shuffled order that is never already the answer order. */
function shuffleAwayFromSolution(tiles: DragTile[], rng: Rng): DragTile[] {
  if (tiles.length < 2) return tiles;
  let out = shuffled(tiles, rng);
  for (let attempt = 0; attempt < 5 && out.every((t, i) => t.id === tiles[i].id); attempt += 1) out = shuffled(tiles, rng);
  return out;
}

interface RoundBase {
  instructions: string;
  explanation: string;
}

/** Terms to drag onto their definitions. */
export function buildMatchRound(input: RoundBase & { pairs: { left: string; right: string }[] }, id: string, rng: Rng = Math.random): DragDropItem | null {
  const seenLeft = new Set<string>();
  const seenRight = new Set<string>();
  const pairs = input.pairs
    .map((p) => ({ left: clean(p.left, 80), right: clean(p.right, 120) }))
    .filter((p) => {
      const l = p.left.toLowerCase();
      const r = p.right.toLowerCase();
      if (!p.left || !p.right || l === r || seenLeft.has(l) || seenRight.has(r)) return false;
      seenLeft.add(l);
      seenRight.add(r);
      return true;
    });
  if (pairs.length < MIN_TILES || pairs.length > MAX_TILES) return null;
  const tiles: DragTile[] = pairs.map((p, i) => ({ id: `t${i}`, label: p.left }));
  const zones: DropZone[] = pairs.map((p, i) => ({ id: `z${i}`, label: p.right }));
  const solution = Object.fromEntries(tiles.map((t, i) => [t.id, zones[i].id]));
  return {
    id,
    kind: "drag_drop",
    mode: "match",
    instructions: clean(input.instructions, 160) || "Drag each term onto its match.",
    tiles: shuffleAwayFromSolution(tiles, rng),
    zones: shuffled(zones, rng),
    solution,
    timeLimitSeconds: timeLimitFor("match", tiles.length),
    explanation: clean(input.explanation, 400),
  };
}

/** Items to sort into categories. */
export function buildCategorizeRound(input: RoundBase & { categories: { name: string; items: string[] }[] }, id: string, rng: Rng = Math.random): DragDropItem | null {
  const zones: DropZone[] = [];
  const tiles: DragTile[] = [];
  const solution: Record<string, string> = {};
  const seen = new Set<string>();
  for (const category of input.categories) {
    const name = clean(category.name, 60);
    if (!name || zones.some((z) => z.label.toLowerCase() === name.toLowerCase())) continue;
    const zoneId = `z${zones.length}`;
    const items = category.items.map((i) => clean(i, 80)).filter((label) => {
      const key = label.toLowerCase();
      if (!label || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    if (items.length < 1) continue;
    zones.push({ id: zoneId, label: name });
    for (const label of items) {
      const tile = { id: `t${tiles.length}`, label };
      tiles.push(tile);
      solution[tile.id] = zoneId;
    }
  }
  if (zones.length < 2 || zones.length > 4 || tiles.length < MIN_TILES + 1 || tiles.length > MAX_TILES + 2) return null;
  // Every category needs at least two items or the round gives the answer away.
  if (zones.some((z) => Object.values(solution).filter((id) => id === z.id).length < 2)) return null;
  return {
    id,
    kind: "drag_drop",
    mode: "categorize",
    instructions: clean(input.instructions, 160) || "Sort each item into the right category.",
    tiles: shuffled(tiles, rng),
    zones,
    solution,
    timeLimitSeconds: timeLimitFor("categorize", tiles.length),
    explanation: clean(input.explanation, 400),
  };
}

const ORDINALS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th"];

/** Steps to put in order. */
export function buildSequenceRound(input: RoundBase & { steps: string[] }, id: string, rng: Rng = Math.random): DragDropItem | null {
  const seen = new Set<string>();
  const steps = input.steps
    .map((s) => clean(s, 100))
    .filter((s) => {
      const key = s.toLowerCase();
      if (!s || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  if (steps.length < MIN_TILES || steps.length > ORDINALS.length) return null;
  const tiles: DragTile[] = steps.map((label, i) => ({ id: `t${i}`, label }));
  const zones: DropZone[] = steps.map((_, i) => ({ id: `z${i}`, label: ORDINALS[i] }));
  const solution = Object.fromEntries(tiles.map((t, i) => [t.id, zones[i].id]));
  return {
    id,
    kind: "drag_drop",
    mode: "sequence",
    instructions: clean(input.instructions, 160) || "Drag the steps into the correct order.",
    tiles: shuffleAwayFromSolution(tiles, rng),
    zones,
    solution,
    timeLimitSeconds: timeLimitFor("sequence", tiles.length),
    explanation: clean(input.explanation, 400),
  };
}

// ── Playing a round ───────────────────────────────────────────────────

/** tile id -> zone id, for tiles that have been placed. Unplaced tiles are absent. */
export type Placement = Record<string, string>;

/** Match and sequence zones take one tile; categories take any number. */
export function zoneCapacity(item: Pick<DragDropItem, "mode">): number {
  return item.mode === "categorize" ? Infinity : 1;
}

/**
 * Drop a tile on a zone (or back on the tray with `zoneId = null`). A tile
 * dropped on a full single-tile zone swaps places: the one already there goes
 * back to the tray.
 */
export function placeTile(item: Pick<DragDropItem, "mode">, placement: Placement, tileId: string, zoneId: string | null): Placement {
  const next: Placement = { ...placement };
  delete next[tileId];
  if (zoneId === null) return next;
  if (zoneCapacity(item) === 1) {
    for (const [other, zone] of Object.entries(next)) if (zone === zoneId) delete next[other];
  }
  next[tileId] = zoneId;
  return next;
}

export function unplacedTiles(item: Pick<DragDropItem, "tiles">, placement: Placement): DragTile[] {
  return item.tiles.filter((t) => !(t.id in placement));
}

export function isComplete(item: Pick<DragDropItem, "tiles">, placement: Placement): boolean {
  return item.tiles.every((t) => t.id in placement);
}

/** Fraction of tiles in the right place (unplaced tiles count as wrong). */
export function scorePlacement(item: Pick<DragDropItem, "tiles" | "solution">, placement: Placement): number {
  if (!item.tiles.length) return 0;
  const right = item.tiles.filter((t) => placement[t.id] === item.solution[t.id]).length;
  return right / item.tiles.length;
}

/** Points for a round: 100 for all-correct plus up to 50 for time left; partial rounds earn their share only. */
export function roundPoints(fraction: number, secondsLeft: number, limit: number): number {
  const base = Math.round(100 * fraction);
  const bonus = fraction >= 1 && limit > 0 ? Math.round(50 * Math.max(0, Math.min(1, secondsLeft / limit))) : 0;
  return base + bonus;
}

// ── The clock ─────────────────────────────────────────────────────────

export function secondsRemaining(startedAtMs: number, limitSeconds: number, nowMs: number): number {
  return Math.max(0, Math.ceil(limitSeconds - (nowMs - startedAtMs) / 1000));
}

export function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
