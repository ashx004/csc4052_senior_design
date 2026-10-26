export const PAGE_LOAD_METRIC_VERSION = "navigation_timing_v1" as const;

export type PageLoadNavigationType =
  | "navigate"
  | "reload"
  | "back_forward"
  | "prerender"
  | "unknown";

export type PageLoadMeasurement = {
  load_time_ms: number;
  navigation_type: PageLoadNavigationType;
  metric_version: typeof PAGE_LOAD_METRIC_VERSION;
};

type NavigationTimingEntry = {
  duration: unknown;
  type?: unknown;
};

type BrowserPerformance = {
  getEntriesByType?: (type: string) => NavigationTimingEntry[];
  timing?: { navigationStart: number; loadEventEnd: number };
};

function validDuration(duration: unknown): number | null {
  if (typeof duration !== "number" || !Number.isFinite(duration)) return null;
  const milliseconds = Math.round(duration);
  if (milliseconds < 0 || milliseconds > 7 * 24 * 60 * 60 * 1000) return null;
  return milliseconds;
}

function navigationType(type: unknown): PageLoadNavigationType {
  if (
    type === "navigate" ||
    type === "reload" ||
    type === "back_forward" ||
    type === "prerender"
  ) {
    return type;
  }
  return "unknown";
}

/**
 * Returns a completed document navigation duration from the browser. It never
 * estimates a value: browsers without completed Navigation Timing data return
 * null so callers can safely skip the event.
 */
export function readPageLoadMeasurement(
  browserPerformance: BrowserPerformance,
): PageLoadMeasurement | null {
  const entry = browserPerformance.getEntriesByType?.("navigation").find(() => true);
  const entryDuration = entry && validDuration(entry.duration);
  if (entry && entryDuration !== null && entryDuration !== undefined) {
    return {
      load_time_ms: entryDuration,
      navigation_type: navigationType(entry.type),
      metric_version: PAGE_LOAD_METRIC_VERSION,
    };
  }

  // PerformanceNavigationTiming is not available in a few older browsers.
  // This legacy browser timing value has the same document-load boundary.
  const timing = browserPerformance.timing;
  if (!timing) return null;
  const legacyDuration = validDuration(timing.loadEventEnd - timing.navigationStart);
  if (legacyDuration === null) return null;
  return {
    load_time_ms: legacyDuration,
    navigation_type: "unknown",
    metric_version: PAGE_LOAD_METRIC_VERSION,
  };
}
