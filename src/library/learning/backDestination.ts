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
