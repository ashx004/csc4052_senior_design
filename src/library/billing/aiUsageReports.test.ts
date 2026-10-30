import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ readDays: vi.fn(), readSnapshot: vi.fn() }));
vi.mock("./rollupStore", async (original) => ({
  ...(await original<typeof import("./rollupStore")>()),
  readDays: mocks.readDays,
  readSnapshot: mocks.readSnapshot,
}));
import {
  REPORT_FAILURE_TTL_MS, REPORT_READ_TIMEOUT_MS, REPORT_SNAPSHOT_TIMEOUT_MS, REPORT_TTL_MS,
  getAdminAiReport, resetAdminAiReportCache,
} from "./aiUsageReports";
import { dayKeysBack } from "./rollupStore";
import { buildDailyRollup, type DailyRollup } from "./dailyRollup";
import { summarizeLedger, type MoneySummary } from "./moneySummary";
import type { PerformanceRow } from "./aiPerformance";

describe("getAdminAiReport", () => {
  const row = (over: Partial<PerformanceRow> = {}): PerformanceRow => ({
    feature: "chat", model: "openrouter:a/b", status: "ok", durationMs: 1000, waitMs: 100, genMs: 800, overheadMs: 50, deliverMs: 50,
    inputTokens: 10, outputTokens: 20, costMicros: 100, chargeMicros: 106, costSource: "provider", at: new Date(), ...over,
  });
  const rollup = (day: string, rows = [row()], money: MoneySummary | null = summarizeLedger([]), balance: number | null = 0): DailyRollup => ({
    ...buildDailyRollup(rows, day, rows.map(() => null), false), money, unusedBalanceMicros: balance,
  });
  const quotaError = () => Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  const ZERO_SUMS = {
    cashCollectedMicros: 0, creditGrantedMicros: 0, cashRefundedMicros: 0, netCashMicros: 0, trialGrantedMicros: 0, creditRefundedMicros: 0,
    costMicros: 0, chargeMicros: 0, marginMicros: 0,
  };
  let keys: string[];

  beforeEach(() => {
    resetAdminAiReportCache();
    mocks.readDays.mockReset();
    mocks.readSnapshot.mockReset().mockResolvedValue(null);
    keys = dayKeysBack(7);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it("marks a live read as live", async () => {
    mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0]), rollup(keys[2])], missing: keys.filter((_, i) => i !== 0 && i !== 2) });
    const r = await getAdminAiReport(7);
    expect(mocks.readDays).toHaveBeenCalledWith(keys);
    expect(mocks.readSnapshot).not.toHaveBeenCalled();
    expect(r.source).toBe("live");
    expect(r.staleReason).toBeNull();
    expect(Math.abs(Date.parse(r.builtAt) - Date.now())).toBeLessThan(5_000);
    expect(r.total.requests).toBe(2);
    expect(r.missingDays).toEqual([keys[6], keys[5], keys[4], keys[3], keys[1]]);
    // The window, not just the span of days that happened to be stored.
    expect(r.since).toBe(`${keys[6]}T00:00:00.000Z`);
    expect(r.until).toBe(new Date(Date.parse(`${keys[0]}T00:00:00.000Z`) + 86_400_000).toISOString());
  });

  it("falls back to the snapshot when Firestore throws RESOURCE_EXHAUSTED", async () => {
    const builtAt = new Date("2026-10-29T23:40:00.000Z");
    mocks.readSnapshot.mockResolvedValue({ rollups: [rollup(keys[1])], builtAt });
    for (const error of [quotaError(), { code: 8 }, new Error("RESOURCE_EXHAUSTED: Quota exceeded.")]) {
      resetAdminAiReportCache();
      mocks.readDays.mockReset().mockRejectedValue(error);
      const r = await getAdminAiReport(7);
      expect(r.source).toBe("snapshot");
      expect(r.builtAt).toBe(builtAt.toISOString());
      expect(r.staleReason).toBe("quota");
      expect(r.total.requests).toBe(1);
    }
  });

  it("names any other Firestore failure as unavailable", async () => {
    mocks.readDays.mockRejectedValue(Object.assign(new Error("14 UNAVAILABLE: connection reset"), { code: 14 }));
    mocks.readSnapshot.mockResolvedValue({ rollups: [], builtAt: new Date("2026-10-29T23:40:00.000Z") });
    const r = await getAdminAiReport(7);
    expect(r.source).toBe("snapshot");
    expect(r.staleReason).toBe("unavailable");
  });

  it("a window with no stored days reports every day as missing rather than zeros", async () => {
    mocks.readDays.mockResolvedValue({ rollups: [], missing: keys });
    const r = await getAdminAiReport(7);
    expect(r.missingDays).toHaveLength(7);
    expect(r.missingDays).toEqual([...keys].sort());
    expect(r.total.requests).toBe(0);
    expect(r.features).toEqual([]);
    // No day to read a balance from: unknown, not a confident $0.00.
    expect(r.money).toEqual({ ...ZERO_SUMS, unusedBalanceMicros: null, unusedBalanceAsOf: null });
  });

  it("throws the original error when Firestore fails and no snapshot exists", async () => {
    const error = quotaError();
    mocks.readDays.mockRejectedValue(error);
    await expect(getAdminAiReport(7)).rejects.toBe(error);
    expect(mocks.readSnapshot).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the requested window from the snapshot's days only", async () => {
    mocks.readDays.mockRejectedValue(quotaError());
    mocks.readSnapshot.mockResolvedValue({
      rollups: [rollup(keys[0]), rollup(keys[3]), rollup("2020-01-01"), rollup(dayKeysBack(30)[20])],
      builtAt: new Date(),
    });
    const week = await getAdminAiReport(7);
    expect(week.total.requests).toBe(2);
    expect(week.missingDays).toEqual(keys.filter((_, i) => i !== 0 && i !== 3).sort());
    const day = await getAdminAiReport(1);
    expect(day.total.requests).toBe(1);
    expect(day.missingDays).toEqual([]);
  });

  it("counts a day the snapshot holds twice only once", async () => {
    mocks.readDays.mockRejectedValue(quotaError());
    mocks.readSnapshot.mockResolvedValue({ rollups: [rollup(keys[0]), rollup(keys[0])], builtAt: new Date() });
    expect((await getAdminAiReport(7)).total.requests).toBe(1);
  });

  it("reports cost, charge, margin and unused balance, leaving unknown-cost rows out", async () => {
    const rows = [
      row(),
      row({ costSource: "unknown", costMicros: 50, chargeMicros: 53 }),
      row({ model: "ollama:llama3.1", costMicros: 0, chargeMicros: 0 }),
    ];
    const purchase = (day: string) => summarizeLedger([{ type: "purchase", amountMicros: 5_000_000, paidMicros: 5_200_000, at: new Date(`${day}T01:00:00Z`) }]);
    mocks.readDays.mockResolvedValue({
      rollups: [rollup(keys[0], rows, purchase(keys[0]), 2_000), rollup(keys[1], rows, purchase(keys[1]), 1_000), rollup(keys[2], rows, null, null)],
      missing: keys.slice(3),
    });
    const r = await getAdminAiReport(7);
    expect(r.money).toEqual({
      cashCollectedMicros: 10_400_000, creditGrantedMicros: 10_000_000, cashRefundedMicros: 0, netCashMicros: 10_400_000,
      trialGrantedMicros: 0, creditRefundedMicros: 0,
      costMicros: 300, chargeMicros: 318, marginMicros: 18,
      unusedBalanceMicros: 2_000, // the newest day's balance, not a sum
      unusedBalanceAsOf: keys[0],
    });
    expect(r.total.unknownCostRows).toBe(3);
    expect(r.total.chargeMicros).toBe(318);
  });

  it("an all-local window shows true zeros for money", async () => {
    const local = [row({ model: "ollama:llama3.1", costMicros: 0, chargeMicros: 0, costSource: "unknown" })];
    // A stored day always records the balance, here an empty one.
    mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0], local, null, 0), rollup(keys[1], local, null, 0)], missing: keys.slice(2) });
    const r = await getAdminAiReport(7);
    expect(r.total.requests).toBe(2);
    expect(r.money).toEqual({ ...ZERO_SUMS, unusedBalanceMicros: 0, unusedBalanceAsOf: keys[0] });
    expect(r.models[0]).toMatchObject({ model: "ollama:llama3.1", costMicros: 0 });
  });

  it("serves repeat requests from memory, shares one read between concurrent callers, and caches per window", async () => {
    mocks.readDays.mockResolvedValue({ rollups: [], missing: [] });
    const [a, b] = await Promise.all([getAdminAiReport(7), getAdminAiReport(7)]);
    expect(a).toBe(b);
    await getAdminAiReport(7);
    expect(mocks.readDays).toHaveBeenCalledTimes(1);
    await getAdminAiReport(30);
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    expect(mocks.readDays).toHaveBeenLastCalledWith(dayKeysBack(30));
  });

  it("after the TTL, serves the cached report and refreshes it in the background", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0])], missing: [] });
    await getAdminAiReport(7);
    vi.setSystemTime(Date.now() + REPORT_TTL_MS - 1_000);
    await getAdminAiReport(7);
    expect(mocks.readDays).toHaveBeenCalledTimes(1);

    mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0]), rollup(keys[1])], missing: [] });
    vi.setSystemTime(Date.now() + 2_000);
    expect((await getAdminAiReport(7)).total.requests).toBe(1); // stale, not blocked
    await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    expect((await getAdminAiReport(7)).total.requests).toBe(2);
  });

  it("keeps the last good report when a refresh fails, and retries after the short failure TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mocks.readDays.mockResolvedValueOnce({ rollups: [rollup(keys[0])], missing: [] });
    await getAdminAiReport(7);
    vi.setSystemTime(Date.now() + REPORT_TTL_MS + 1);
    mocks.readDays.mockRejectedValue(new Error("boom"));
    expect((await getAdminAiReport(7)).source).toBe("live");
    await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalled();

    vi.setSystemTime(Date.now() + REPORT_FAILURE_TTL_MS - 1_000);
    expect((await getAdminAiReport(7)).total.requests).toBe(1);
    await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 2_000);
    await getAdminAiReport(7); await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(3);
  });

  it("does not cache a cold failure", async () => {
    mocks.readDays.mockRejectedValueOnce(new Error("boom"));
    await expect(getAdminAiReport(7)).rejects.toThrow("boom");
    mocks.readDays.mockResolvedValue({ rollups: [], missing: keys });
    expect((await getAdminAiReport(7)).source).toBe("live");
  });

  it("re-checks Firestore soon after serving a snapshot", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    mocks.readDays.mockRejectedValueOnce(quotaError());
    mocks.readSnapshot.mockResolvedValue({ rollups: [], builtAt: new Date() });
    expect((await getAdminAiReport(7)).source).toBe("snapshot");
    mocks.readDays.mockResolvedValue({ rollups: [], missing: keys });
    vi.setSystemTime(Date.now() + REPORT_FAILURE_TTL_MS + 1);
    await getAdminAiReport(7); await settle();
    expect((await getAdminAiReport(7)).source).toBe("live");
  });

  describe("with a feature", () => {
    const quiz = (over: Partial<PerformanceRow> = {}) => row({ feature: "quiz-generation", ...over });

    it("adds that feature's detail, built from the same days as the report", async () => {
      mocks.readDays.mockResolvedValue({
        rollups: [
          rollup(keys[0], [quiz({ durationMs: 21_000, costMicros: 900 }), quiz({ status: "error", errorKind: "rate_limit", httpStatus: 429 }), row()]),
          rollup(keys[2], [quiz({ durationMs: 4_000, costMicros: 300 })]),
        ],
        missing: keys.filter((_, i) => i !== 0 && i !== 2),
      });
      const r = await getAdminAiReport(7, "quiz-generation");
      const reportFeature = r.features.find((f) => f.feature === "quiz-generation")!;
      expect(r.featureDetail).toMatchObject({
        feature: "quiz-generation", requests: 3, errors: 1, timedCount: 2, errorKinds: { rate_limit: 1 },
      });
      expect(r.featureDetail!.requests).toBe(reportFeature.requests);
      expect(r.featureDetail!.days.map((d) => d.day)).toEqual([keys[2], keys[0]]);
      expect(r.featureDetail!.days.reduce((s, d) => s + d.costMicros, 0)).toBe(reportFeature.costMicros);
      expect(r.featureDetail!.notable.slowest.map((n) => n.durationMs)).toEqual([21_000, 4_000]);
      expect(r.total.requests).toBe(4); // the rest of the report is unchanged
    });

    it("builds the detail from the snapshot when the snapshot is served", async () => {
      mocks.readDays.mockRejectedValue(quotaError());
      mocks.readSnapshot.mockResolvedValue({ rollups: [rollup(keys[1], [quiz(), quiz()]), rollup("2020-01-01", [quiz()])], builtAt: new Date() });
      const r = await getAdminAiReport(7, "quiz-generation");
      expect(r.source).toBe("snapshot");
      expect(r.featureDetail).toMatchObject({ requests: 2, days: [{ day: keys[1], requests: 2 }] });
    });

    it("leaves the detail out when no feature is asked for", async () => {
      mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0], [quiz()])], missing: [] });
      expect(await getAdminAiReport(7)).not.toHaveProperty("featureDetail");
    });

    it("caches per window and feature", async () => {
      mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0], [quiz(), row()])], missing: [] });
      const plain = await getAdminAiReport(7);
      const forQuiz = await getAdminAiReport(7, "quiz-generation");
      const forChat = await getAdminAiReport(7, "chat");
      expect(plain.featureDetail).toBeUndefined();
      expect(forQuiz.featureDetail?.feature).toBe("quiz-generation");
      expect(forChat.featureDetail?.feature).toBe("chat");
      await getAdminAiReport(7, "quiz-generation");
      expect(mocks.readDays).toHaveBeenCalledTimes(3);
    });

    it("survives JSON unchanged: no Infinity edge, no NaN", async () => {
      mocks.readDays.mockResolvedValue({ rollups: [rollup(keys[0], [quiz({ durationMs: 200_000 })])], missing: [] });
      const r = await getAdminAiReport(7, "quiz-generation");
      expect(JSON.parse(JSON.stringify(r.featureDetail))).toEqual(r.featureDetail);
      expect(r.featureDetail!.durationHist.at(-1)).toBe(1); // above the last finite edge
    });
  });

  it("gives up on a hung Firestore read and serves the snapshot", async () => {
    vi.useFakeTimers();
    mocks.readDays.mockReturnValue(new Promise(() => {}));
    mocks.readSnapshot.mockResolvedValue({ rollups: [], builtAt: new Date() });
    const pending = getAdminAiReport(7);
    await vi.advanceTimersByTimeAsync(REPORT_READ_TIMEOUT_MS + 1);
    const r = await pending;
    expect(r.source).toBe("snapshot");
    expect(r.staleReason).toBe("unavailable");
  });

  it("gives up on a hung snapshot read sooner, so a cold request fails before the client's 40 s abort", async () => {
    vi.useFakeTimers();
    mocks.readDays.mockReturnValue(new Promise(() => {}));
    mocks.readSnapshot.mockReturnValue(new Promise(() => {}));
    const pending = getAdminAiReport(7);
    const outcome = pending.then(() => "resolved", (e: Error) => e.message);
    await vi.advanceTimersByTimeAsync(REPORT_READ_TIMEOUT_MS + REPORT_SNAPSHOT_TIMEOUT_MS + 1);
    // The Firestore error is the one rethrown; the snapshot's own timeout only ends the wait.
    expect(await outcome).toBe("Rollup read timed out");
    expect(REPORT_SNAPSHOT_TIMEOUT_MS).toBe(8_000);
    expect(REPORT_READ_TIMEOUT_MS + REPORT_SNAPSHOT_TIMEOUT_MS).toBeLessThan(40_000);
  });
});
