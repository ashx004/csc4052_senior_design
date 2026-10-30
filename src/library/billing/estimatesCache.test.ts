import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ readDays: vi.fn(), collection: vi.fn() }));
// Spied on so a reintroduced raw read of aiUsage shows up as a call here.
vi.mock("../firebaseAdmin", () => ({ adminDb: { collection: mocks.collection } }));
vi.mock("./rollupStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rollupStore")>()),
  readDays: mocks.readDays,
}));
import type { PerformanceRow } from "./aiPerformance";
import { buildDailyRollup, medianChargeByFeature, type DailyRollup } from "./dailyRollup";
import { ESTIMATE_DAYS, ESTIMATE_READ_TIMEOUT_MS, ESTIMATE_FAILURE_TTL_MS, ESTIMATE_TTL_MS, currentEstimates, resetEstimatesCache } from "./estimatesCache";
import { TASK_ESTIMATES } from "./pricing";
import { dayKeysBack } from "./rollupStore";

const quiz = (e: typeof TASK_ESTIMATES) => e.find((x) => x.task === "Quiz (10 questions)")!.typicalUsd;
const rows = (n: number, chargeMicros: number, costMicros = chargeMicros, feature = "quiz-generation"): PerformanceRow[] =>
  Array.from({ length: n }, () => ({ feature, model: "google:x", status: "ok", costMicros, chargeMicros, costSource: "provider", durationMs: 1, waitMs: 0, genMs: 1, overheadMs: 0, deliverMs: 0, inputTokens: 1, outputTokens: 1, at: new Date() }));
const day = (key: string, list: PerformanceRow[]): DailyRollup => buildDailyRollup(list, key, list.map(() => null), false);
const daysOf = (list: PerformanceRow[]) => ({ rollups: [day("2026-10-29", list)], missing: [] });
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); resetEstimatesCache();
  mocks.collection.mockReset(); mocks.readDays.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("medianChargeByFeature", () => {
  it("keeps a feature below the request floor on its hardcoded estimate", () => {
    // 19 priced requests, split over two days: under the floor, so absent and measuredEstimates leaves TASK_ESTIMATES alone.
    const under = [day("2026-10-28", rows(10, 4200)), day("2026-10-29", rows(9, 4200))];
    expect(medianChargeByFeature(under).has("quiz-generation")).toBe(false);
    // The 20th request crosses the default floor, counted across days.
    const at = [day("2026-10-28", rows(10, 4200)), day("2026-10-29", rows(10, 4200))];
    expect(medianChargeByFeature(at).get("quiz-generation")).toBe(5000);
  });

  it("uses chargeMicros, not costMicros", () => {
    // Cost 1,000 sits in the 1,000 bucket; charge 4,200 sits in the 5,000 bucket.
    const m = medianChargeByFeature([day("2026-10-29", rows(25, 4200, 1000))]);
    expect(m.get("quiz-generation")).toBe(5000);
  });

  it("leaves out a feature whose median falls in the open-topped bucket", () => {
    expect(medianChargeByFeature([day("2026-10-29", rows(25, 2_000_000))]).has("quiz-generation")).toBe(false);
  });
});

describe("currentEstimates", () => {
  it("never queries raw aiUsage rows: it reads the last 30 day documents instead", async () => {
    mocks.readDays.mockResolvedValue(daysOf(rows(25, 4200)));
    currentEstimates(); await settle();
    expect(mocks.collection).not.toHaveBeenCalled();
    expect(ESTIMATE_DAYS).toBe(30);
    expect(mocks.readDays).toHaveBeenCalledTimes(1);
    expect(mocks.readDays).toHaveBeenCalledWith(dayKeysBack(30));
    expect(quiz(currentEstimates())).toBe(0.005);
  });

  it("returns the defaults immediately when cold, then the measured list once the refresh lands", async () => {
    mocks.readDays.mockResolvedValue(daysOf(rows(25, 4200)));
    expect(currentEstimates()).toEqual(TASK_ESTIMATES);
    await settle();
    expect(quiz(currentEstimates())).toBe(0.005);
  });

  it("falls back to the defaults when the read fails", async () => {
    mocks.readDays.mockRejectedValue(new Error("firestore down"));
    expect(currentEstimates()).toEqual(TASK_ESTIMATES);
    await settle();
    expect(currentEstimates()).toEqual(TASK_ESTIMATES);
  });

  it("keeps the previous estimates when the day read fails", async () => {
    mocks.readDays.mockResolvedValueOnce(daysOf(rows(25, 4200)));
    currentEstimates(); await settle();
    vi.setSystemTime(Date.now() + ESTIMATE_TTL_MS + 1);
    mocks.readDays.mockRejectedValue(new Error("8 RESOURCE_EXHAUSTED"));
    currentEstimates(); await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    expect(quiz(currentEstimates())).toBe(0.005);
  });

  it("shares one read between concurrent callers", async () => {
    mocks.readDays.mockResolvedValue({ rollups: [], missing: [] });
    currentEstimates(); currentEstimates(); currentEstimates();
    await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(1);
  });

  it("caches a success for six hours, since the day documents change only nightly", () => {
    expect(ESTIMATE_TTL_MS).toBe(6 * 60 * 60 * 1000);
    expect(ESTIMATE_FAILURE_TTL_MS).toBe(60 * 1000);
    expect(ESTIMATE_READ_TIMEOUT_MS).toBe(20 * 1000);
  });

  it("caches a success for the full TTL, then refreshes while still serving the old value", async () => {
    mocks.readDays.mockResolvedValue(daysOf(rows(25, 4200)));
    currentEstimates(); await settle();
    vi.setSystemTime(Date.now() + ESTIMATE_TTL_MS - 1000);
    currentEstimates(); await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(1);
    mocks.readDays.mockResolvedValue(daysOf(rows(25, 8000)));
    vi.setSystemTime(Date.now() + 2000);
    expect(quiz(currentEstimates())).toBe(0.005); // stale value, not blocked
    await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    expect(quiz(currentEstimates())).toBe(0.01);
  });

  it("retries a failed read only after the short failure TTL, keeping the last good value", async () => {
    mocks.readDays.mockResolvedValueOnce(daysOf(rows(25, 4200)));
    currentEstimates(); await settle();
    vi.setSystemTime(Date.now() + ESTIMATE_TTL_MS + 1);
    mocks.readDays.mockRejectedValue(new Error("boom"));
    currentEstimates(); await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + ESTIMATE_FAILURE_TTL_MS - 1000);
    expect(quiz(currentEstimates())).toBe(0.005);
    await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 2000);
    currentEstimates(); await settle();
    expect(mocks.readDays).toHaveBeenCalledTimes(3);
  });

  it("gives up on a hung read so a later refresh can run", async () => {
    vi.useFakeTimers();
    mocks.readDays.mockReturnValue(new Promise(() => {}));
    currentEstimates();
    await vi.advanceTimersByTimeAsync(ESTIMATE_READ_TIMEOUT_MS + 1);
    expect(console.error).toHaveBeenCalled();
    vi.setSystemTime(Date.now() + ESTIMATE_FAILURE_TTL_MS + 1);
    mocks.readDays.mockResolvedValue({ rollups: [], missing: [] });
    currentEstimates();
    expect(mocks.readDays).toHaveBeenCalledTimes(2);
  });
});
