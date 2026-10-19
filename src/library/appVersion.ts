/** Negative if a < b, 0 if equal, positive if a > b, for "1.2.3"-style versions. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff) return diff;
  }
  return 0;
}

export type AndroidRelease = { version: string; url: string; notesUrl: string } | null;
export type AppVersionInfo = { build: string | null; android: AndroidRelease };
