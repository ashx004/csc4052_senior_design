// Chooses which retrieved chunks to send for one source, under a character
// budget. Greedy maximal-marginal-relevance: repeatedly take the chunk with
// the best (retrieval score − redundancy with what is already chosen).
//
// Diversity matters more than raw ranking here. Question generation has no
// real query, so similarity ordering alone tends to pick several chunks
// saying the same thing, which produces several questions saying the same
// thing. Selecting for coverage instead is what the budget-constrained
// context-selection literature recommends (see the spec's research section).

export type ChunkCandidate = { text: string; page?: number; score: number; vector?: number[] };

/** How much redundancy with already-selected chunks counts against a candidate. */
const REDUNDANCY_WEIGHT = 0.5;

export function cosine(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0;
  let aa = 0;
  let bb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  if (aa === 0 || bb === 0) return 0;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

export function selectChunks(candidates: ChunkCandidate[], maxChars: number): ChunkCandidate[] {
  const pool = candidates.filter((c) => c.text && c.text.trim().length > 0);
  const chosen: ChunkCandidate[] = [];
  const takenText = new Set<string>();
  let used = 0;

  while (pool.length > 0) {
    let bestIndex = -1;
    let bestValue = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const candidate = pool[i];
      if (used + candidate.text.length > maxChars) continue;
      if (takenText.has(candidate.text)) continue;

      let redundancy = 0;
      if (candidate.vector) {
        for (const picked of chosen) {
          if (!picked.vector) continue;
          redundancy = Math.max(redundancy, cosine(candidate.vector, picked.vector));
        }
      }
      const value = candidate.score - REDUNDANCY_WEIGHT * redundancy;
      if (value > bestValue) {
        bestValue = value;
        bestIndex = i;
      }
    }

    if (bestIndex === -1) break;
    const [picked] = pool.splice(bestIndex, 1);
    chosen.push(picked);
    takenText.add(picked.text);
    used += picked.text.length;
  }

  return chosen;
}
