import { expect, it } from "vitest";
import { summarizePerformance, type PerformanceRow } from "./aiPerformance";

const row = (durationMs: number | null, costMicros = 10): PerformanceRow => ({
  feature: "chat", model: "m", status: "ok", durationMs, waitMs: null, genMs: null,
  overheadMs: 0, deliverMs: null, inputTokens: 1, outputTokens: 1, costMicros, chargeMicros: costMicros, costSource: "provider", at: new Date(),
});
const win = { since: "a", until: "b", truncated: false };

it("percentiles use timed rows only; untimed rows still count requests and cost", () => {
  const timed = [100, 200, 300, 400, 500].map((d) => row(d));
  const untimed = [row(null, 7), row(null, 7), row(null, 7), row(null, 7)];
  const f = summarizePerformance([...timed, ...untimed], win).features[0];
  expect(f.p50Ms).toBe(300); // would be 200 if untimed rows counted as 0
  expect(f.requests).toBe(9);
  expect(f.costMicros).toBe(5 * 10 + 4 * 7);
});
it("a feature with only untimed rows has no percentile", () => {
  const f = summarizePerformance(Array.from({ length: 6 }, () => row(null)), win).features[0];
  expect(f.p50Ms).toBeNull();
  expect(f.requests).toBe(6);
});
