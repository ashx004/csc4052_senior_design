// Browser half of error tracking: sends an error to /api/client-errors, which
// records it and decides whether to email the team (errorReporter.ts).
// Safe to call anywhere; it never throws.

const MAX_REPORTS_PER_PAGE_LOAD = 10;
const reported = new Set<string>();

export function reportClientError(error: unknown, extra: { digest?: string } = {}): void {
  try {
    if (typeof window === "undefined") return;
    const err = error instanceof Error ? error : new Error(typeof error === "string" ? error : "Non-Error value thrown");

    // The same crash often fires repeatedly (re-renders, retries): send it once.
    const key = `${err.name}:${err.message}`;
    if (reported.has(key) || reported.size >= MAX_REPORTS_PER_PAGE_LOAD) return;
    reported.add(key);

    void fetch("/api/client-errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // keepalive lets the report finish even if the page is closing.
      keepalive: true,
      body: JSON.stringify({
        message: err.message.slice(0, 1000) || "Unknown error",
        name: err.name.slice(0, 200),
        stack: err.stack?.slice(0, 8000),
        // Path only: query strings can hold ids or tokens.
        route: window.location.pathname.slice(0, 500),
        digest: extra.digest,
        build: process.env.NEXT_PUBLIC_BUILD_ID,
      }),
    }).catch(() => {});
  } catch {
    // Reporting is best effort.
  }
}
