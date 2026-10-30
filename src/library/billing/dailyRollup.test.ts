import { describe, expect, it } from "vitest";
import { summarizePerformance, type PerformanceRow } from "./aiPerformance";
import { buildDailyRollup, featureDetail, mergeRollups, type DailyRollup } from "./dailyRollup";
import { DURATION_EDGES_MS } from "./histogram";
import { marginMicros, type MoneySummary } from "./moneySummary";

const row = (o: Partial<PerformanceRow> = {}): PerformanceRow => ({
  feature: "chat", model: "openrouter:x", status: "ok" as PerformanceRow["status"],
  durationMs: 100, waitMs: null, genMs: null, overheadMs: 0, deliverMs: null,
  inputTokens: 10, outputTokens: 5, costMicros: 100, chargeMicros: o.costMicros ?? 100, costSource: "provider",
  at: new Date("2026-10-29T12:00:00Z"), ...o,
});

const build = (rows: PerformanceRow[], day = "2026-10-29", uids: (string | null)[] = rows.map(() => null)) =>
  buildDailyRollup(rows, day, uids, false);

const money = (o: Partial<MoneySummary> = {}): MoneySummary => ({
  cashCollectedMicros: 0, creditGrantedMicros: 0, cashRefundedMicros: 0, netCashMicros: 0,
  trialGrantedMicros: 0, creditRefundedMicros: 0, ...o,
});

describe("buildDailyRollup", () => {
  it("a feature's cost excludes local, failed and unknown-cost rows", () => {
    const r = buildDailyRollup([
      row({ feature: "chat", costMicros: 1000, chargeMicros: 1055, costSource: "provider" }),
      row({ feature: "chat", costMicros: 9999, costSource: "unknown" }),
      row({ feature: "chat", model: "ollama:llama3", costMicros: 0 }),
      row({ feature: "chat", status: "error", costMicros: 0 }),
    ], "2026-10-29", [null, null, null, null], false);
    expect(r.features.chat.costMicros).toBe(1000);
    expect(r.features.chat.unknownCostRows).toBe(1);
    expect(r.features.chat.localRequests).toBe(1);
    expect(r.features.chat.errors).toBe(1);
    expect(r.features.chat.requests).toBe(4);
  });

  it("a feature's charge leaves out the same rows its cost does", () => {
    const r = build([
      row({ costMicros: 1000, chargeMicros: 1055 }),
      row({ costMicros: 0, chargeMicros: 777, costSource: "unknown" }),
      row({ model: "ollama:llama3", costMicros: 0, chargeMicros: 5 }),
      row({ status: "error", costMicros: 0, chargeMicros: 9 }),
    ]);
    expect(r.features.chat.chargeMicros).toBe(1055);
  });

  it("does not count free local or failed rows as unknown-cost, though they are stored with costSource unknown", () => {
    const r = build([
      row({ model: "ollama:llama3", costMicros: 0, costSource: "unknown" }),
      row({ status: "error", costMicros: 0, costSource: "unknown" }),
    ]);
    expect(r.features.chat.unknownCostRows).toBe(0);
  });

  it("records the day, the row count and the truncation flag", () => {
    const r = buildDailyRollup([row(), row()], "2026-10-29", [null, null], true);
    expect(r.day).toBe("2026-10-29");
    expect(r.rowsRead).toBe(2);
    expect(r.truncated).toBe(true);
  });

  it("leaves money and unused balance for the store to fill in", () => {
    const r = build([row()]);
    expect(r.money).toBeNull();
    expect(r.unusedBalanceMicros).toBeNull();
  });

  it("builds the duration histogram from timed rows only", () => {
    const r = build([
      row({ durationMs: 150 }),
      row({ durationMs: 50, status: "error" }),
      row({ durationMs: 70, status: "incomplete" }),
      row({ durationMs: null }),
    ]);
    expect(r.features.chat.timedCount).toBe(1);
    expect(r.features.chat.durationHist.reduce((a, b) => a + b, 0)).toBe(1);
    expect(r.features.chat.durationHist[1]).toBe(1); // the 100..200 ms bucket
  });

  it("builds the charge histogram from the rows a /billing median is taken over", () => {
    const r = build([
      row({ chargeMicros: 200 }),
      row({ chargeMicros: 200, status: "incomplete" }),
      row({ chargeMicros: 200, costSource: "unknown" }),
      row({ chargeMicros: 200, model: "ollama:llama3" }),
      row({ chargeMicros: 200, status: "error" }),
    ]);
    expect(r.features.chat.chargeHist.reduce((a, b) => a + b, 0)).toBe(1);
    expect(r.features.chat.chargeHist[1]).toBe(1); // the 100..250 micros bucket
  });

  it("sums each stage over streamed rows, so a merge can reproduce the exact means", () => {
    const r = build([
      row({ waitMs: 100, genMs: 300, overheadMs: 10, deliverMs: null }),
      row({ waitMs: 200, genMs: null, overheadMs: 20, deliverMs: 40 }),
      row({ waitMs: null, overheadMs: 999 }),               // not streamed: overhead must not count
      row({ waitMs: 999, status: "error", overheadMs: 999 }), // failed: not timed
    ]);
    expect(r.features.chat.stageSums).toEqual({ waitMs: 300, genMs: 300, overheadMs: 30, deliverMs: 40 });
    expect(r.features.chat.stageCounts).toEqual({ waitMs: 2, genMs: 1, overheadMs: 2, deliverMs: 1 });
  });

  it("groups by model and counts fallbacks", () => {
    const r = build([
      row({ model: "openrouter:a", durationMs: 100, costMicros: 300 }),
      row({ model: "openrouter:a", durationMs: 200, fallback: true, costMicros: 0, costSource: "unknown" }),
      row({ model: "openrouter:b", status: "error", durationMs: 50, costMicros: 0 }),
    ]);
    expect(Object.keys(r.models).sort()).toEqual(["openrouter:a", "openrouter:b"]);
    expect(r.models["openrouter:a"]).toMatchObject({ requests: 2, errors: 0, fallbacks: 1, totalDurationMs: 300, timedCount: 2, costMicros: 300 });
    expect(r.models["openrouter:b"]).toMatchObject({ requests: 1, errors: 1, fallbacks: 0, totalDurationMs: 50, timedCount: 0, costMicros: 0 });
  });

  it("counts each feature's rows per requested model, failed and local ones included", () => {
    const r = build([
      row({ feature: "chat", model: "openrouter:a" }),
      row({ feature: "chat", model: "openrouter:a", status: "error" }),
      row({ feature: "chat", model: "ollama:llama3" }),
      row({ feature: "quiz", model: "openrouter:a" }),
    ]);
    expect(r.features.chat.modelCounts).toEqual({ "openrouter:a": 2, "ollama:llama3": 1 });
    expect(r.features.quiz.modelCounts).toEqual({ "openrouter:a": 1 });
  });

  it("counts each feature's failures by error kind, a missing kind as unknown", () => {
    const r = build([
      row({ status: "error", errorKind: "rate_limit", httpStatus: 429 }),
      row({ status: "error", errorKind: "rate_limit", httpStatus: 429 }),
      row({ status: "error", errorKind: "timeout" }),
      row({ status: "error" }),
      row({ status: "ok", errorKind: "provider_error" }),
      row({ status: "incomplete" }),
    ]);
    expect(r.features.chat.errorKinds).toEqual({ rate_limit: 2, timeout: 1, unknown: 1 });
  });

  it("counts the rows a feature's cost is summed over, stopped streams included", () => {
    const r = build([
      row({ costMicros: 1000 }),
      row({ costMicros: 400, status: "incomplete" }),
      row({ costMicros: 9999, costSource: "unknown" }),
      row({ model: "ollama:llama3", costMicros: 0 }),
      row({ status: "error", costMicros: 0 }),
    ]);
    expect(r.features.chat.pricedRequests).toBe(2);
    expect(r.features.chat.costMicros).toBe(1400);
    // The charge histogram leaves the stopped stream out, so it cannot stand in for this count.
    expect(r.features.chat.chargeHist.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("counts every recorded duration in a model's total time, but only timed rows in its histogram", () => {
    const m = build([
      row({ durationMs: 100 }),
      row({ durationMs: 5000, status: "error" }),
      row({ durationMs: 3000, status: "incomplete" }),
      row({ durationMs: null }),
    ]).models["openrouter:x"];
    expect(m.totalDurationMs).toBe(8100);
    expect(m.timedCount).toBe(1);
    expect(m.durationHist.reduce((a, b) => a + b, 0)).toBe(1);
  });

  it("keys students by the shortened uid it was given and never by a full one", () => {
    const r = buildDailyRollup([row({ chargeMicros: 500 })], "2026-10-29", ["a1b2c3d4…"], false);
    expect(Object.keys(r.students)).toEqual(["a1b2c3d4…"]);
  });

  it("sums a student's requests and charge", () => {
    const r = build([row({ chargeMicros: 500 }), row({ chargeMicros: 300 })], "2026-10-29", ["a1b2c3d4…", "a1b2c3d4…"]);
    expect(r.students["a1b2c3d4…"]).toEqual({ requests: 2, chargeMicros: 800 });
  });

  it("drops rows with a null uid from the students map", () => {
    const r = buildDailyRollup([row({ chargeMicros: 500 })], "2026-10-29", [null], false);
    expect(r.students).toEqual({});
  });

  it("refuses a uid list that is not parallel to the rows", () => {
    expect(() => buildDailyRollup([row(), row()], "2026-10-29", [null], false)).toThrow();
  });

  describe("notable rows", () => {
    it("keeps the five slowest timed rows, slowest first", () => {
      const rows = [100, 700, 300, 900, 200, 800, 400].map((durationMs) => row({ durationMs }));
      rows.push(row({ durationMs: 5000, status: "error" }), row({ durationMs: 6000, status: "incomplete" }));
      const slowest = build(rows).features.chat.notable.slowest;
      expect(slowest.map((n) => n.durationMs)).toEqual([900, 800, 700, 400, 300]);
    });

    it("keeps the five costliest billed rows with a known cost, costliest first", () => {
      const rows = [10, 70, 30, 90, 20, 80].map((costMicros) => row({ costMicros }));
      rows.push(
        row({ costMicros: 9999, costSource: "unknown" }),
        row({ costMicros: 9999, model: "ollama:llama3" }),
        row({ costMicros: 9999, status: "error" }),
      );
      const costliest = build(rows).features.chat.notable.costliest;
      expect(costliest.map((n) => n.costMicros)).toEqual([90, 80, 70, 30, 20]);
    });

    it("keeps the ten most recent failures, newest first", () => {
      const rows = Array.from({ length: 12 }, (_, i) =>
        row({ status: "error", at: new Date(Date.UTC(2026, 9, 29, i)), httpStatus: 502, errorKind: "provider_error" }));
      rows.push(row({ status: "ok", at: new Date(Date.UTC(2026, 9, 29, 23)) }));
      const failures = build(rows).features.chat.notable.failures;
      expect(failures).toHaveLength(10);
      expect(failures[0].at).toBe("2026-10-29T11:00:00.000Z");
      expect(failures[9].at).toBe("2026-10-29T02:00:00.000Z");
      expect(failures[0]).toMatchObject({ status: "error", httpStatus: 502, errorKind: "provider_error" });
    });

    it("carries only the listed fields: no uid, no message text", () => {
      const tainted = { ...row({ status: "error", durationMs: null }), uid: "full-uid-0123456789", message: "student text" } as PerformanceRow;
      const [failure] = build([tainted], "2026-10-29", ["full-uid…"]).features.chat.notable.failures;
      expect(failure).toEqual({
        at: "2026-10-29T12:00:00.000Z", durationMs: null, status: "error", model: "openrouter:x",
        inputTokens: 10, outputTokens: 5, costMicros: 100, httpStatus: null, errorKind: null,
      });
    });
  });
});

describe("mergeRollups", () => {
  it("merges histograms across days so p95 reflects the whole window", () => {
    const slowDay = build(Array.from({ length: 10 }, () => row({ durationMs: 25000 })), "2026-10-28");
    const fastDay = build(Array.from({ length: 90 }, () => row({ durationMs: 150 })), "2026-10-29");
    const [chat] = mergeRollups([slowDay, fastDay]).features;
    expect(chat.p50Ms).toBe(200);
    expect(chat.p95Ms).toBe(30000);
  });

  it("reports null percentiles for a feature with fewer than 5 timed requests, as the exact path does", () => {
    const rows = [row(), row(), row(), row(), row({ status: "error" })];
    const [merged] = mergeRollups([build(rows)]).features;
    const [exact] = summarizePerformance(rows, { since: "", until: "", truncated: false }).features;
    expect(merged.p50Ms).toBeNull();
    expect(merged.p95Ms).toBeNull();
    expect(exact.p50Ms).toBeNull();
    expect(merged).toMatchObject({ timedCount: 4, p50AboveMs: null, p95AboveMs: null });
  });

  it("says when a percentile lies above the last bucket edge, instead of passing it off as too few timed requests", () => {
    const rows = [...Array.from({ length: 18 }, () => row({ durationMs: 150 })), row({ durationMs: 120_000 }), row({ durationMs: 200_000 })];
    const [chat] = mergeRollups([build(rows)]).features;
    expect(chat).toMatchObject({ timedCount: 20, p50Ms: 200, p50AboveMs: null, p95Ms: null, p95AboveMs: 90_000 });
    const [model] = mergeRollups([build(rows)]).models;
    expect(model).toMatchObject({ p50Ms: 200, p50AboveMs: null, p95Ms: null, p95AboveMs: 90_000 });
    const allSlow = mergeRollups([build(Array.from({ length: 5 }, () => row({ durationMs: 100_000 })))]).features[0];
    expect(allSlow).toMatchObject({ p50Ms: null, p50AboveMs: 90_000, p95Ms: null, p95AboveMs: 90_000 });
    expect(JSON.parse(JSON.stringify(chat))).toEqual(chat);
  });

  it("reports stages as null when no day recorded a single stage", () => {
    const [chat] = mergeRollups([build([row()], "2026-10-28"), build([row()], "2026-10-29")]).features;
    expect(chat.stages).toBeNull();
  });

  it("reproduces the exact per-stage means across days", () => {
    const day1 = [row({ waitMs: 100, genMs: 300, overheadMs: 10, deliverMs: null }), row({ waitMs: null, overheadMs: 999 })];
    const day2 = [row({ waitMs: 200, genMs: 500, overheadMs: 30, deliverMs: 60 })];
    const [merged] = mergeRollups([build(day1, "2026-10-28"), build(day2, "2026-10-29")]).features;
    const [exact] = summarizePerformance([...day1, ...day2], { since: "", until: "", truncated: false }).features;
    expect(merged.stages).toEqual(exact.stages);
    expect(merged.stages).toEqual({ waitMs: 150, genMs: 400, overheadMs: 20, deliverMs: 60 });
  });

  it("sums features and totals across days and sorts features as summarizePerformance does", () => {
    const day1 = build([row({ feature: "quiz" }), row({ feature: "chat", status: "error" })], "2026-10-28");
    const day2 = build([row({ feature: "chat", costMicros: 400, inputTokens: 1, outputTokens: 2 }), row({ feature: "chat" })], "2026-10-29");
    const r = mergeRollups([day1, day2]);
    expect(r.features.map((f) => f.feature)).toEqual(["chat", "quiz"]);
    expect(r.features[0]).toMatchObject({ requests: 3, errors: 1, inputTokens: 21, outputTokens: 12, costMicros: 500 });
    expect(r.features[0].errorRate).toBeCloseTo(1 / 3);
    expect(r.total).toEqual({ requests: 4, errors: 1, inputTokens: 31, outputTokens: 17, costMicros: 600, chargeMicros: 600, unknownCostRows: 0 });
  });

  it("totals charge and unknown-cost rows across features and days, so margin is charge less cost", () => {
    const day1 = build([
      row({ feature: "chat", costMicros: 1000, chargeMicros: 1055 }),
      row({ feature: "quiz", costMicros: 0, chargeMicros: 0, costSource: "unknown" }),
    ], "2026-10-28");
    const day2 = build([
      row({ feature: "chat", costMicros: 2000, chargeMicros: 2110 }),
      row({ feature: "chat", costMicros: 0, chargeMicros: 0, costSource: "unknown" }),
      row({ feature: "quiz", costMicros: 500, chargeMicros: 530 }),
    ], "2026-10-29");
    const { total } = mergeRollups([day1, day2]);
    expect(total.chargeMicros).toBe(3695);
    expect(total.costMicros).toBe(3500);
    expect(total.unknownCostRows).toBe(2);
    expect(marginMicros(total.chargeMicros, total.costMicros)).toBe(195);
  });

  it("merges notable rows across days with the same caps and ordering", () => {
    const day1 = build([
      ...[100, 900, 300].map((durationMs) => row({ durationMs, costMicros: durationMs })),
      ...Array.from({ length: 6 }, (_, i) => row({ status: "error", at: new Date(Date.UTC(2026, 9, 28, i)) })),
    ], "2026-10-28");
    const day2 = build([
      ...[800, 200, 700].map((durationMs) => row({ durationMs, costMicros: durationMs })),
      ...Array.from({ length: 6 }, (_, i) => row({ status: "error", at: new Date(Date.UTC(2026, 9, 29, i)) })),
    ], "2026-10-29");
    const [chat] = mergeRollups([day1, day2]).features;
    expect(chat.notable.slowest.map((n) => n.durationMs)).toEqual([900, 800, 700, 300, 200]);
    expect(chat.notable.costliest.map((n) => n.costMicros)).toEqual([900, 800, 700, 300, 200]);
    expect(chat.notable.failures).toHaveLength(10);
    expect(chat.notable.failures[0].at).toBe("2026-10-29T05:00:00.000Z");
    expect(chat.notable.failures[9].at).toBe("2026-10-28T02:00:00.000Z");
  });

  it("sums each feature's requested-model counts across days", () => {
    const day1 = build([row({ model: "openrouter:a" }), row({ model: "openrouter:b" })], "2026-10-28");
    const day2 = build([row({ model: "openrouter:a" }), row({ model: "openrouter:a" })], "2026-10-29");
    const [chat] = mergeRollups([day1, day2]).features;
    expect(chat.modelCounts).toEqual({ "openrouter:a": 3, "openrouter:b": 1 });
  });

  it("treats a stored day built before model counts existed as having none", () => {
    const old = (day: string): DailyRollup => {
      const r = build([row({ model: "openrouter:a" })], day);
      delete (r.features.chat as { modelCounts?: unknown }).modelCounts;
      return r;
    };
    expect(mergeRollups([old("2026-10-28")]).features[0].modelCounts).toEqual({});
    const mixed = mergeRollups([old("2026-10-28"), build([row({ model: "openrouter:b" })], "2026-10-29")]);
    expect(mixed.features[0].modelCounts).toEqual({ "openrouter:b": 1 });
  });

  it("sums each feature's error kinds across days, treating a day built before them as having none", () => {
    const day1 = build([row({ status: "error", errorKind: "rate_limit" }), row({ status: "error", errorKind: "timeout" })], "2026-10-27");
    const day2 = build([row({ status: "error", errorKind: "rate_limit" })], "2026-10-28");
    const old = build([row({ status: "error", errorKind: "network" })], "2026-10-29");
    delete (old.features.chat as { errorKinds?: unknown }).errorKinds;
    expect(featureDetail([day1, day2, old], "chat").errorKinds).toEqual({ rate_limit: 2, timeout: 1 });
    expect(featureDetail([old], "chat").errorKinds).toEqual({});
  });

  it("merges models with percentiles from their histograms, busiest first", () => {
    const day1 = build([row({ model: "openrouter:a", fallback: true }), row({ model: "openrouter:b" })], "2026-10-28");
    const day2 = build(Array.from({ length: 5 }, () => row({ model: "openrouter:b", durationMs: 400 })), "2026-10-29");
    const { models } = mergeRollups([day1, day2]);
    expect(models.map((m) => m.model)).toEqual(["openrouter:b", "openrouter:a"]);
    expect(models[0]).toEqual({
      model: "openrouter:b", requests: 6, totalDurationMs: 2100, p50Ms: 500, p95Ms: 500, p50AboveMs: null, p95AboveMs: null,
      inputTokens: 60, outputTokens: 30, costMicros: 600, fallbacks: 0,
    });
    expect(models[1]).toMatchObject({ requests: 1, fallbacks: 1, p50Ms: null, p95Ms: null });
  });

  it("merges students by shortened uid, biggest spender first", () => {
    const day1 = build([row({ chargeMicros: 100 }), row({ chargeMicros: 900 })], "2026-10-28", ["aaaaaaaa…", "bbbbbbbb…"]);
    const day2 = build([row({ chargeMicros: 300 })], "2026-10-29", ["aaaaaaaa…"]);
    expect(mergeRollups([day1, day2]).students).toEqual([
      { shortUid: "bbbbbbbb…", requests: 1, chargeMicros: 900 },
      { shortUid: "aaaaaaaa…", requests: 2, chargeMicros: 400 },
    ]);
  });

  it("lists days that are absent from the input in missingDays", () => {
    // given rollups for the 27th and 29th and a window covering 27-29
    const day27 = build([row()], "2026-10-27");
    const day29 = build([row()], "2026-10-29");
    expect(mergeRollups([day27, day29]).missingDays).toEqual(["2026-10-28"]);
  });

  it("finds gaps across a month boundary regardless of input order", () => {
    const r = mergeRollups([build([row()], "2026-11-02"), build([row()], "2026-10-30")]);
    expect(r.missingDays).toEqual(["2026-10-31", "2026-11-01"]);
  });

  it("spans the window from the first day's start to the end of the last day, in UTC", () => {
    const r = mergeRollups([build([row()], "2026-10-29"), build([row()], "2026-10-27")]);
    expect(r.since).toBe("2026-10-27T00:00:00.000Z");
    expect(r.until).toBe("2026-10-30T00:00:00.000Z");
  });

  it("is truncated when any day was truncated", () => {
    const r = mergeRollups([build([row()], "2026-10-28"), buildDailyRollup([row()], "2026-10-29", [null], true)]);
    expect(r.truncated).toBe(true);
  });

  it("returns an empty report for no days", () => {
    const r = mergeRollups([]);
    expect(r.features).toEqual([]);
    expect(r.missingDays).toEqual([]);
    expect(r.total.requests).toBe(0);
    expect(r.money).toBeNull();
    expect(r.unusedBalanceMicros).toBeNull();
    expect(r.unusedBalanceAsOf).toBeNull();
  });

  describe("money", () => {
    const withMoney = (day: string, m: MoneySummary | null, unusedBalanceMicros: number | null): DailyRollup =>
      ({ ...build([row()], day), money: m, unusedBalanceMicros });

    it("sums each money field across the days that have money", () => {
      const r = mergeRollups([
        withMoney("2026-10-27", money({ cashCollectedMicros: 10, netCashMicros: 10, trialGrantedMicros: 1 }), null),
        withMoney("2026-10-28", null, null),
        withMoney("2026-10-29", money({ cashCollectedMicros: 5, cashRefundedMicros: 2, netCashMicros: 3, creditRefundedMicros: 4 }), null),
      ]);
      expect(r.money).toEqual(money({ cashCollectedMicros: 15, cashRefundedMicros: 2, netCashMicros: 13, trialGrantedMicros: 1, creditRefundedMicros: 4 }));
    });

    it("is null when no day has money", () => {
      expect(mergeRollups([withMoney("2026-10-28", null, null), withMoney("2026-10-29", null, null)]).money).toBeNull();
    });

    it("takes the unused balance from the newest day that recorded one", () => {
      const r = mergeRollups([
        withMoney("2026-10-29", null, null),
        withMoney("2026-10-28", null, 7000),
        withMoney("2026-10-27", null, 5000),
      ]);
      expect(r.unusedBalanceMicros).toBe(7000);
      expect(r.unusedBalanceAsOf).toBe("2026-10-28");
    });

    it("has no balance and no as-of day when no day recorded one", () => {
      const r = mergeRollups([withMoney("2026-10-28", null, null), withMoney("2026-10-29", null, null)]);
      expect(r.unusedBalanceMicros).toBeNull();
      expect(r.unusedBalanceAsOf).toBeNull();
    });
  });
});

describe("featureDetail", () => {
  const quizDay = (day: string, durations: number[], o: Partial<PerformanceRow> = {}) =>
    build(durations.map((durationMs) => row({ feature: "quiz", durationMs, at: new Date(`${day}T12:00:00Z`), ...o })), day);

  it("merges the feature's histogram over the days and takes its percentiles from it, as the report does", () => {
    const days = [quizDay("2026-10-28", Array(10).fill(25000)), quizDay("2026-10-29", Array(90).fill(150))];
    const d = featureDetail(days, "quiz");
    const [merged] = mergeRollups(days).features;
    expect(d.timedCount).toBe(100);
    expect(d.durationHist.reduce((a, b) => a + b, 0)).toBe(100);
    expect(d.durationHist).toHaveLength(DURATION_EDGES_MS.length);
    expect(d.p50Ms).toBe(merged.p50Ms);
    expect(d.p95Ms).toBe(merged.p95Ms);
    expect([d.p50Ms, d.p95Ms]).toEqual([200, 30000]);
    expect([d.p50AboveMs, d.p95AboveMs]).toEqual([null, null]);
  });

  it("carries a p95 above the last edge as that edge, matching the report", () => {
    const days = [quizDay("2026-10-29", [...Array(18).fill(150), 120_000, 200_000])];
    const d = featureDetail(days, "quiz");
    expect(d).toMatchObject({ p50Ms: 200, p50AboveMs: null, p95Ms: null, p95AboveMs: 90_000 });
    expect(d.p95AboveMs).toBe(mergeRollups(days).features[0].p95AboveMs);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it("sends only the finite edges, one fewer than the buckets, so nothing turns into null in JSON", () => {
    const d = featureDetail([quizDay("2026-10-29", [100])], "quiz");
    expect(d.durationEdgesMs).toEqual(DURATION_EDGES_MS.slice(0, -1));
    expect(d.durationEdgesMs.every(Number.isFinite)).toBe(true);
    expect(d.durationHist.length).toBe(d.durationEdgesMs.length + 1);
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  });

  it("totals requests and errors and merges the notable rows", () => {
    const days = [
      build([row({ feature: "quiz", durationMs: 900 }), row({ feature: "quiz", status: "error", errorKind: "rate_limit", httpStatus: 429 })], "2026-10-28"),
      build([row({ feature: "quiz", durationMs: 700 }), row({ feature: "chat", durationMs: 99999 })], "2026-10-29"),
    ];
    const d = featureDetail(days, "quiz");
    expect(d).toMatchObject({ feature: "quiz", requests: 3, errors: 1, errorKinds: { rate_limit: 1 } });
    expect(d.notable.slowest.map((n) => n.durationMs)).toEqual([900, 700]);
    expect(d.notable.failures).toHaveLength(1);
    expect(d.notable.failures[0]).toMatchObject({ httpStatus: 429, errorKind: "rate_limit" });
  });

  it("gives one entry per stored day, oldest first, with the cost, the rows it is over, and the costliest request", () => {
    const days = [
      build([row({ feature: "quiz", costMicros: 300 }), row({ feature: "quiz", costMicros: 900 }), row({ feature: "quiz", status: "error", costMicros: 0 })], "2026-10-29"),
      build([row({ feature: "chat" })], "2026-10-27"),
      build([row({ feature: "quiz", costMicros: 500, status: "incomplete" })], "2026-10-28"),
    ];
    expect(featureDetail(days, "quiz").days).toEqual([
      // The feature was not used on a day that has a document: a true zero.
      { day: "2026-10-27", requests: 0, costMicros: 0, pricedRequests: 0, maxCostMicros: null },
      { day: "2026-10-28", requests: 1, costMicros: 500, pricedRequests: 1, maxCostMicros: 500 },
      { day: "2026-10-29", requests: 3, costMicros: 1200, pricedRequests: 2, maxCostMicros: 900 },
    ]);
  });

  it("leaves a stored day's priced-row count null when the day was built before it was counted", () => {
    const old = build([row({ feature: "quiz", costMicros: 300 })], "2026-10-29");
    delete (old.features.quiz as { pricedRequests?: unknown }).pricedRequests;
    expect(featureDetail([old], "quiz").days[0]).toEqual({ day: "2026-10-29", requests: 1, costMicros: 300, pricedRequests: null, maxCostMicros: 300 });
  });

  it("describes a feature with no rows as zeros and null percentiles, never NaN", () => {
    const d = featureDetail([build([row()], "2026-10-29")], "quiz");
    expect(d).toMatchObject({ requests: 0, errors: 0, timedCount: 0, p50Ms: null, p95Ms: null, p50AboveMs: null, p95AboveMs: null, errorKinds: {} });
    expect(d.durationHist.every((n) => n === 0)).toBe(true);
    expect(d.notable).toEqual({ slowest: [], costliest: [], failures: [] });
    expect(JSON.parse(JSON.stringify(d))).toEqual(d);
    expect(featureDetail([], "quiz").days).toEqual([]);
  });

  it("does not read inherited object keys as features", () => {
    expect(featureDetail([build([row()], "2026-10-29")], "constructor").requests).toBe(0);
  });
});
