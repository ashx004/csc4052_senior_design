// Which sources a saved study set came from.
//
// A set has carried exactly one `sourceDocKey` until now, and that single
// field does four jobs: finding an existing set to append to, linking a
// flashcard set to its quiz, showing the set against a document, and
// feeding per-document mastery in the study plan. Rather than change all
// four, a multi-source set stores the full list in `sourceKeys` and keeps
// `sourceDocKey` as the primary key (the smallest, see primaryKeyOf), so every existing query still resolves.
//
// Sets written before this field existed simply have no `sourceKeys`, which
// reads back as a one-key list — no migration needed.

export function sourceKeysOf(set: { sourceDocKey?: string | null; sourceKeys?: string[] | null }): string[] {
  if (Array.isArray(set.sourceKeys) && set.sourceKeys.length > 0) return set.sourceKeys;
  return set.sourceDocKey ? [set.sourceDocKey] : [];
}

/** Firestore cannot compare arrays in a query, so the set match happens here. */
export function sameSourceSet(a: string[], b: string[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size !== right.size) return false;
  for (const key of left) if (!right.has(key)) return false;
  return true;
}

/**
 * The key written to `sourceDocKey`. Sorted first so the same selection
 * always yields the same primary key whatever order the student ticked them,
 * which is what makes the append lookup find the set again.
 */
export function primaryKeyOf(keys: string[]): string {
  if (keys.length === 0) throw new Error("A study set needs at least one source.");
  return [...keys].sort()[0];
}
