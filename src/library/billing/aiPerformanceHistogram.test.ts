import { expect, it } from "vitest";
import { percentile, timedDurations, type PerformanceRow } from "./aiPerformance";
import { DURATION_EDGES_MS, percentileFromHistogram, toHistogram } from "./histogram";

const row = (o: Partial<PerformanceRow> = {}): PerformanceRow => ({
  feature: "chat", model: "openrouter:x", status: "ok" as PerformanceRow["status"],
  durationMs: 100, waitMs: null, genMs: null, overheadMs: 0, deliverMs: null,
  inputTokens: 10, outputTokens: 5, costMicros: 100, chargeMicros: o.costMicros ?? 100, costSource: "provider", at: new Date(0), ...o,
});

it("timedDurations keeps only rows the exact path would time", () => {
  const rows = [
    row({ status: "ok", durationMs: 100 }),
    row({ status: "error", durationMs: 50 }),       // failed: ran short
    row({ status: "incomplete", durationMs: 70 }),  // stopped: ran short
    row({ status: "ok", durationMs: null }),        // predates telemetry
  ];
  expect(timedDurations(rows)).toEqual([100]);
});

it("a histogram built from timedDurations agrees with the exact percentile inside bucket width", () => {
  const values = [120, 340, 560, 900, 1200, 3400, 8000, 12000, 19000, 41000];
  const exact = percentile(values, 0.95)!;
  const bucketed = percentileFromHistogram(toHistogram(values, DURATION_EDGES_MS), DURATION_EDGES_MS, 0.95)!;
  expect(bucketed).toBeGreaterThanOrEqual(exact);
  expect(bucketed).toBeLessThanOrEqual(45000);
});
