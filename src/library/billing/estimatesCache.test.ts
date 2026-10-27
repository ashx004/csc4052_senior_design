import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock("./aiUsageReports", () => ({ loadUsageRows: mocks.load }));
import { ESTIMATE_READ_TIMEOUT_MS, ESTIMATE_FAILURE_TTL_MS, ESTIMATE_TTL_MS, currentEstimates, resetEstimatesCache } from "./estimatesCache";
import { TASK_ESTIMATES } from "./pricing";

const quiz = (e: typeof TASK_ESTIMATES) => e.find((x) => x.task === "Quiz (10 questions)")!.typicalUsd;
const rows = (n: number, costMicros: number) =>
  Array.from({ length: n }, () => ({ feature: "quiz-generation", model: "google:x", status: "ok", costMicros, chargeMicros: costMicros, costSource: "provider", durationMs: 1, waitMs: 0, genMs: 1, overheadMs: 0, deliverMs: 0, inputTokens: 1, outputTokens: 1, at: new Date() }));
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); resetEstimatesCache(); mocks.load.mockReset(); vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("currentEstimates", () => {
  it("returns the defaults immediately when cold, then the measured list once the refresh lands", async () => {
    mocks.load.mockResolvedValue({ rows: rows(25, 4200), truncated: false });
    expect(currentEstimates()).toEqual(TASK_ESTIMATES);
    await settle();
    expect(quiz(currentEstimates())).toBeCloseTo(0.0042);
  });

  it("falls back to the defaults when the read fails", async () => {
    mocks.load.mockRejectedValue(new Error("firestore down"));
    expect(currentEstimates()).toEqual(TASK_ESTIMATES);
    await settle();
    expect(currentEstimates()).toEqual(TASK_ESTIMATES);
  });

  it("shares one read between concurrent callers", async () => {
    mocks.load.mockResolvedValue({ rows: [], truncated: false });
    currentEstimates(); currentEstimates(); currentEstimates();
    await settle();
    expect(mocks.load).toHaveBeenCalledTimes(1);
  });

  it("caches a success for the full TTL, then refreshes while still serving the old value", async () => {
    mocks.load.mockResolvedValue({ rows: rows(25, 4200), truncated: false });
    currentEstimates(); await settle();
    vi.setSystemTime(Date.now() + ESTIMATE_TTL_MS - 1000);
    currentEstimates(); await settle();
    expect(mocks.load).toHaveBeenCalledTimes(1);
    mocks.load.mockResolvedValue({ rows: rows(25, 5000), truncated: false });
    vi.setSystemTime(Date.now() + 2000);
    expect(quiz(currentEstimates())).toBeCloseTo(0.0042); // stale value, not blocked
    await settle();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(quiz(currentEstimates())).toBeCloseTo(0.005);
  });

  it("retries a failed read only after the short failure TTL, keeping the last good value", async () => {
    mocks.load.mockResolvedValueOnce({ rows: rows(25, 4200), truncated: false });
    currentEstimates(); await settle();
    vi.setSystemTime(Date.now() + ESTIMATE_TTL_MS + 1);
    mocks.load.mockRejectedValue(new Error("boom"));
    currentEstimates(); await settle();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + ESTIMATE_FAILURE_TTL_MS - 1000);
    expect(quiz(currentEstimates())).toBeCloseTo(0.0042);
    await settle();
    expect(mocks.load).toHaveBeenCalledTimes(2);
    vi.setSystemTime(Date.now() + 2000);
    currentEstimates(); await settle();
    expect(mocks.load).toHaveBeenCalledTimes(3);
  });

  it("gives up on a hung read so a later refresh can run", async () => {
    vi.useFakeTimers();
    mocks.load.mockReturnValue(new Promise(() => {}));
    currentEstimates();
    await vi.advanceTimersByTimeAsync(ESTIMATE_READ_TIMEOUT_MS + 1);
    expect(console.error).toHaveBeenCalled();
    vi.setSystemTime(Date.now() + ESTIMATE_FAILURE_TTL_MS + 1);
    mocks.load.mockResolvedValue({ rows: [], truncated: false });
    currentEstimates();
    expect(mocks.load).toHaveBeenCalledTimes(2);
  });
});
