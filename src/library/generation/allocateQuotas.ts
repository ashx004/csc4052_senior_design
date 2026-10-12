// How many items each selected source contributes to one generated set.
//
// Coverage is enforced here, in code, rather than asked for in the prompt:
// a prompt instruction to "spread questions evenly" cannot be verified,
// and long-context attention bias means a single large prompt silently
// under-draws from its middle sources (see the spec's research section).
//
// Two stages, following standard test-blueprint practice: every source
// gets a floor so nothing is invisible, then the remainder is split by
// content volume as a proxy for instructional time. The floor degrades
// when the requested count cannot support it everywhere — see below.

import { SourceSelectionError } from "@/src/library/sources/errors";

/**
 * Target items per source. Fewer than this cannot support per-concept
 * diagnosis, so it is what every source gets whenever the count allows;
 * a count too small for it degrades the floor rather than refusing.
 */
export const PER_SOURCE_FLOOR = 4;

/** How far a weight may move a source off its proportional share. */
const MAX_WEIGHT_SHIFT = 0.5;

export type QuotaSource = { id: string; textLength: number };

export function allocateQuotas(
  sources: QuotaSource[],
  count: number,
  weights?: Record<string, number>
): number[] {
  if (sources.length === 0) throw new SourceSelectionError("Choose at least one source to study from.");
  if (!Number.isInteger(count) || count < 1) throw new SourceSelectionError("Choose how many items you want.");

  // One item per source is the true hard minimum: below that some source
  // would be invisible no matter how the remainder is split.
  if (count < sources.length) {
    throw new SourceSelectionError(
      `This set needs at least ${sources.length} items for ${sources.length} sources — ` +
        `raise the count or pick fewer sources.`
    );
  }

  // The floor is a target, not a guarantee: it degrades when the count cannot
  // support PER_SOURCE_FLOOR everywhere, because refusing to generate is worse
  // for the student than a thinner set. A 1-3 question quiz and a 10-note
  // notebook both have to work.
  const floor = Math.min(PER_SOURCE_FLOOR, Math.floor(count / sources.length));

  const minimum = sources.length * floor;

  // Stage 1: the floor.
  const quotas = sources.map(() => floor);
  const remaining = count - minimum;
  if (remaining === 0) return quotas;

  // Stage 2: proportional by volume, optionally re-weighted. A zero total
  // (every source empty) degrades to an even split rather than dividing by zero.
  const total = sources.reduce((sum, s) => sum + Math.max(0, s.textLength), 0);
  const shares = sources.map((s) => (total > 0 ? Math.max(0, s.textLength) / total : 1 / sources.length));

  const weighted = shares.map((share, i) => {
    const weight = weights?.[sources[i].id];
    if (!weight || !Number.isFinite(weight) || weight <= 0) return share;
    const shifted = share * weight;
    const lower = share * (1 - MAX_WEIGHT_SHIFT);
    const upper = share * (1 + MAX_WEIGHT_SHIFT);
    return Math.min(upper, Math.max(lower, shifted));
  });

  const weightedTotal = weighted.reduce((a, b) => a + b, 0);
  const normalized = weighted.map((w) => w / weightedTotal);

  // Largest-remainder apportionment, so the quotas sum to exactly `count`.
  const exact = normalized.map((share) => share * remaining);
  const floors = exact.map(Math.floor);
  let assigned = floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((value, i) => ({ i, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder);

  for (let k = 0; assigned < remaining; k++, assigned++) {
    floors[order[k % order.length].i] += 1;
  }

  for (let i = 0; i < quotas.length; i++) quotas[i] += floors[i];
  return quotas;
}
