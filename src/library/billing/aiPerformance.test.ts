import { describe, expect, it } from "vitest";
import { medianCostByFeature, percentile, summarizePerformance, type PerformanceRow } from "./aiPerformance";

const row = (o: Partial<PerformanceRow> = {}): PerformanceRow => ({
  feature: "chat", model: "openrouter:x", status: "ok" as PerformanceRow["status"],
  durationMs: 100, waitMs: null, genMs: null, overheadMs: 0, deliverMs: null,
  inputTokens: 10, outputTokens: 5, costMicros: 100, chargeMicros: o.costMicros ?? 100, costSource: "provider", at: new Date(0), ...o,
});
const win = { since: "a", until: "b", truncated: false };
const one = (rows: PerformanceRow[]) => summarizePerformance(rows, win).features[0];

describe("percentile", () => {
  it("returns null percentiles below five requests", () => {
    expect(percentile([10, 20, 30, 40], 0.5)).toBeNull();
    expect(percentile([10, 20, 30, 40, 50], 0.5)).toBe(30);
  });
  it("takes p95 by nearest rank", () => {
    expect(percentile(Array.from({ length: 100 }, (_, i) => i + 1), 0.95)).toBe(95);
  });
});

describe("summarizePerformance", () => {
  it("counts error rate per feature and excludes failures from timing", () => {
    const oks = [100, 200, 300, 400, 500].map((durationMs) => row({ durationMs }));
    const s = one([...oks, row({ status: "error" as PerformanceRow["status"], durationMs: 1 })]);
    expect(s.errorRate).toBeCloseTo(1 / 6);
    expect(s.p50Ms).toBe(300);
  });
  it("excludes stopped streams from timing but keeps their cost", () => {
    const oks = [100, 200, 300, 400, 500].map((durationMs) => row({ durationMs }));
    const s = one([...oks, row({ status: "incomplete" as PerformanceRow["status"], durationMs: 1, costMicros: 40 })]);
    expect(s.p50Ms).toBe(300);
    expect(s.costMicros).toBe(540);
  });
  it("includes local rows in percentiles and in the error-rate denominator", () => {
    const local = [10, 20, 30, 40].map((durationMs) => row({ model: "ollama:x", durationMs, costMicros: 0 }));
    const s = one([...local, row({ durationMs: 50 }), row({ status: "error" as PerformanceRow["status"], durationMs: 1 })]);
    expect(s.p50Ms).toBe(30);
    expect(s.errorRate).toBeCloseTo(1 / 6);
  });
  it("excludes error rows from stages", () => {
    const s = one([row({ waitMs: 10, genMs: 10, deliverMs: 10 }), row({ status: "error" as PerformanceRow["status"], waitMs: 1000, genMs: 1000, deliverMs: 1000 })]);
    expect(s.stages).toEqual({ waitMs: 10, genMs: 10, overheadMs: 0, deliverMs: 10 });
  });
  it("averages each stage over rows where it is measured", () => {
    const s = one([row({ waitMs: 10, genMs: 20, deliverMs: 4 }), row({ waitMs: 30, genMs: 40, deliverMs: null })]);
    expect(s.stages).toMatchObject({ waitMs: 20, genMs: 30, deliverMs: 4 });
    expect(one([row({ waitMs: 10, genMs: null, deliverMs: null })]).stages).toMatchObject({ genMs: null, deliverMs: null });
  });
  it("reports null stages when a feature never streamed", () => {
    expect(one([row(), row()]).stages).toBeNull();
  });
  it("averages stages over streamed rows", () => {
    const s = one([row({ waitMs: 10, genMs: 20, overheadMs: 2, deliverMs: 4 }), row({ waitMs: 30, genMs: 40, overheadMs: 4, deliverMs: 6 }), row()]);
    expect(s.stages).toEqual({ waitMs: 20, genMs: 30, overheadMs: 3, deliverMs: 5 });
  });
  it("counts local rows in requests and timing but not cost", () => {
    const rows = [row(), row({ model: "ollama:llama", costMicros: 999 }), row({ model: "ollama:llama", costMicros: 999 })];
    const s = one(rows);
    expect(s.requests).toBe(3);
    expect(s.localRequests).toBe(2);
    expect(s.costMicros).toBe(100);
  });
  it("excludes error rows from cost and sorts by requests", () => {
    const rep = summarizePerformance([
      row({ feature: "a", costMicros: 5 }),
      row({ feature: "b", status: "error" as PerformanceRow["status"], costMicros: 1000 }),
      row({ feature: "b", costMicros: 7 }), row({ feature: "b", costMicros: 9 }),
    ], win);
    expect(rep.features.map((f) => f.feature)).toEqual(["b", "a"]);
    expect(rep.total).toMatchObject({ requests: 4, errors: 1, costMicros: 21 });
  });
});

describe("medianCostByFeature", () => {
  it("ignores features below the minimum when taking median cost", () => {
    const rows = [...Array.from({ length: 5 }, () => row({ feature: "ocr" })), ...Array.from({ length: 20 }, (_, i) => row({ costMicros: i }))];
    const m = medianCostByFeature(rows, 20);
    expect(m.has("ocr")).toBe(false);
    expect(m.get("chat")).toBe(9.5);
  });
  it("leaves stopped streams out of the median", () => {
    const rows = [...Array.from({ length: 20 }, () => row({ costMicros: 10 })), row({ status: "incomplete" as PerformanceRow["status"], costMicros: 1 })];
    expect(medianCostByFeature(rows, 20).get("chat")).toBe(10);
    expect(medianCostByFeature(rows.slice(0, 19).concat(rows[20]), 20).has("chat")).toBe(false);
  });
  it("takes the median of what the student was charged, not provider cost", () => {
    const rows = Array.from({ length: 20 }, () => row({ costMicros: 100, chargeMicros: 106 }));
    expect(medianCostByFeature(rows, 20).get("chat")).toBe(106);
  });
  it("skips rows whose cost was never resolved", () => {
    const real = Array.from({ length: 20 }, () => row({ costMicros: 100, chargeMicros: 106 }));
    const unknown = Array.from({ length: 30 }, () => row({ costMicros: 0, chargeMicros: 0, costSource: "unknown" }));
    expect(medianCostByFeature([...real, ...unknown], 20).get("chat")).toBe(106);
    expect(medianCostByFeature([...real.slice(0, 19), ...unknown], 20).has("chat")).toBe(false);
  });
  it("leaves local and error rows out of the threshold count", () => {
    const rows = [...Array.from({ length: 10 }, () => row()), ...Array.from({ length: 10 }, () => row({ model: "ollama:x", costMicros: 500 })), row({ status: "error" as PerformanceRow["status"], costMicros: 500 })];
    expect(medianCostByFeature(rows, 20).has("chat")).toBe(false);
  });
});
