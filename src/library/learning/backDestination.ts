export type BackDestination =
  | { kind: "path"; path: string }
  | { kind: "history" }
  | { kind: "fallback" };

/**
 * Returns the value only when it is a same-origin path: a single leading "/",
 * no "//" or "/\" host trick, and no scheme anywhere. A query string is fine.
 */
export function safeReturnPath(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const path = value.trim();
  if (!path.startsWith("/")) return null;
  if (path.startsWith("//") || path.startsWith("/\\")) return null;
  if (path.includes("://") || path.includes("\\")) return null;
  // Browsers strip tab/CR/LF inside URLs, so "/\t/evil.com" would become "//evil.com".
  if (/[\u0000-\u001f\u007f\s]/.test(path)) return null;
  return path;
}

/** Tier 1: a safe `from` path. Tier 2: browser history. Tier 3: the caller's fallback. */
export function resolveBackDestination(input: {
  from: string | null | undefined;
  hasInAppHistory: boolean;
}): BackDestination {
  const path = safeReturnPath(input.from);
  if (path) return { kind: "path", path };
  if (input.hasInAppHistory) return { kind: "history" };
  return { kind: "fallback" };
}

/**
 * Decides this history entry's depth within the tab. `recordedDepth` is the
 * depth already stamped into history.state (null if absent or invalid);
 * `storedCounter` is the tab's sessionStorage counter (0 if absent or invalid).
 * A stamped entry was visited before (refresh, back/forward): keep its depth.
 * An unstamped entry is new: depth is counter + 1 and it must be stamped.
 * Depth > 1 means an earlier in-app entry exists behind this one.
 */
export function resolveHistoryDepth(input: {
  recordedDepth: number | null;
  storedCounter: number;
}): { depth: number; stamp: boolean; hasInAppHistory: boolean } {
  const { recordedDepth, storedCounter } = input;
  if (recordedDepth !== null) {
    return { depth: recordedDepth, stamp: false, hasInAppHistory: recordedDepth > 1 };
  }
  const depth = storedCounter + 1;
  return { depth, stamp: true, hasInAppHistory: depth > 1 };
}
