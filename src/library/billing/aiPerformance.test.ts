import { describe, expect, it } from "vitest";
import { percentile, summarizePerformance, usageDocToRow, type PerformanceRow } from "./aiPerformance";

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

describe("usageDocToRow", () => {
  it("reads the legacy boolean incomplete as a stopped stream unless a status is recorded", () => {
    expect(usageDocToRow({ incomplete: true }).status).toBe("incomplete");
    expect(usageDocToRow({ incomplete: false }).status).toBe("ok");
    expect(usageDocToRow({ status: "error", incomplete: true }).status).toBe("error");
    expect(usageDocToRow({ status: "weird" }).status).toBe("ok");
  });
  it("marks a cost unknown unless both a source and a charge were recorded", () => {
    expect(usageDocToRow({ costMicros: 100, chargeMicros: 106, costSource: "provider" })).toMatchObject({ costMicros: 100, chargeMicros: 106, costSource: "provider" });
    expect(usageDocToRow({ costMicros: 100, costSource: "provider" }).costSource).toBe("unknown");
    expect(usageDocToRow({ costMicros: 100, chargeMicros: 106 }).costSource).toBe("unknown");
  });
  it("names an empty, missing or non-string feature or model 'unknown'", () => {
    for (const bad of ["", undefined, 7, null]) {
      expect(usageDocToRow({ feature: bad, model: bad })).toMatchObject({ feature: "unknown", model: "unknown" });
    }
    expect(usageDocToRow({ feature: "chat", model: "openrouter:a/b.c" })).toMatchObject({ feature: "chat", model: "openrouter:a/b.c" });
  });
  it("defaults a bare legacy document to an untimed, failure-free row and never copies uid", () => {
    const row = usageDocToRow({ uid: "a1b2c3d4e5f6", at: { toDate: () => new Date(1000) } });
    expect(row).toEqual({
      feature: "unknown", model: "unknown", status: "ok",
      durationMs: null, waitMs: null, genMs: null, overheadMs: 0, deliverMs: null,
      inputTokens: 0, outputTokens: 0, costMicros: 0, chargeMicros: 0, costSource: "unknown",
      at: new Date(1000), fallback: false, httpStatus: null, errorKind: null,
    });
    expect(usageDocToRow({}).at).toEqual(new Date(0));
  });
  it("keeps failure detail only when it has the right type", () => {
    expect(usageDocToRow({ fallback: true, httpStatus: 429, errorKind: "rate-limit" })).toMatchObject({ fallback: true, httpStatus: 429, errorKind: "rate-limit" });
    expect(usageDocToRow({ fallback: "yes", httpStatus: "500", errorKind: 7 })).toMatchObject({ fallback: false, httpStatus: null, errorKind: null });
  });
});
