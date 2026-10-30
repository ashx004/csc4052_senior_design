import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), checkRateLimit: vi.fn(), report: vi.fn() }));
vi.mock("@/src/library/adminAuth", async (original) => ({
  ...(await original<typeof import("@/src/library/adminAuth")>()),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/src/library/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/src/library/billing/aiUsageReports", () => ({ getAdminAiReport: mocks.report }));
import { AdminAccessError } from "@/src/library/adminAuth";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import { buildDailyRollup, featureDetail, type NotableRow } from "@/src/library/billing/dailyRollup";
import type { PerformanceRow } from "@/src/library/billing/aiPerformance";
import { GET } from "./route";

const req = (qs = "") => new NextRequest(`https://catalyst.test/api/admin/ai-usage${qs}`);

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ uid: "admin" });
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.report.mockResolvedValue({ features: [{ feature: "chat", requests: 3 }] });
});

it("rejects a non-admin", async () => {
  mocks.requireAdmin.mockRejectedValueOnce(new AdminAccessError(403, "Access denied"));
  expect((await GET(req("?days=7"))).status).toBe(403);
  expect(mocks.report).not.toHaveBeenCalled();
});
it("rejects bad days and extra params", async () => {
  for (const qs of ["?days=90", "?days=0", "?days=abc", "?days=1.5", "?days=7&x=1", "?x=1"]) {
    expect((await GET(req(qs))).status, qs).toBe(400);
  }
  expect(mocks.report).not.toHaveBeenCalled();
});
it("rejects an unknown feature id at the endpoint", async () => {
  for (const qs of ["?days=7&feature=not-a-feature", "?feature=", "?days=7&feature=constructor", "?days=7&feature=CHAT"]) {
    const res = await GET(req(qs));
    expect(res.status, qs).toBe(400);
    expect((await res.json()).error, qs).toBe("Unknown AI feature.");
  }
  expect(mocks.report).not.toHaveBeenCalled();
});
it("still rejects every other parameter and a bad window alongside a feature", async () => {
  for (const qs of ["?days=7&feature=chat&view=cost", "?feature=chat&x=1", "?days=0&feature=chat", "?days=32&feature=chat"]) {
    expect((await GET(req(qs))).status, qs).toBe(400);
  }
  expect(mocks.report).not.toHaveBeenCalled();
});
it("returns the report with the feature's detail for a student or background feature", async () => {
  const rows = [21_400, 4_200, 300_000].map((durationMs): PerformanceRow => ({
    feature: "quiz-generation", model: "gemini-1.5-flash", status: "ok", durationMs, waitMs: null, genMs: null, overheadMs: 0, deliverMs: null,
    inputTokens: 10, outputTokens: 20, costMicros: 100, chargeMicros: 106, costSource: "provider", at: new Date("2026-10-29T12:00:00Z"),
  }));
  const detail = featureDetail([buildDailyRollup(rows, "2026-10-29", rows.map(() => null), false)], "quiz-generation");
  mocks.report.mockResolvedValueOnce({ ...realisticReport, featureDetail: detail });
  const res = await GET(req("?days=14&feature=quiz-generation"));
  expect(res.status).toBe(200);
  expect(mocks.report).toHaveBeenCalledWith(14, "quiz-generation");
  const text = await res.text();
  expect(text).not.toMatch(/Infinity|NaN/);
  const body = JSON.parse(text) as AdminAiReport;
  // Through JSON unchanged: an Infinity edge would have come back as null.
  expect(body.featureDetail).toEqual(detail);
  expect(body.featureDetail!.durationEdgesMs).not.toContain(null);

  mocks.report.mockResolvedValueOnce(realisticReport);
  expect((await GET(req("?feature=advising-generate-schedule"))).status).toBe(200);
  expect(mocks.report).toHaveBeenLastCalledWith(7, "advising-generate-schedule");

  // Chat history compaction records itself as chat-summarize.
  mocks.report.mockResolvedValueOnce(realisticReport);
  expect((await GET(req("?feature=chat-summarize"))).status).toBe(200);
  expect(mocks.report).toHaveBeenLastCalledWith(7, "chat-summarize");
});
it("returns per-feature statistics for an admin", async () => {
  const res = await GET(req("?days=31"));
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await res.json()).features[0]).toMatchObject({ feature: "chat", requests: expect.any(Number) });
  expect(mocks.report).toHaveBeenCalledWith(31);
});

const notableRow: NotableRow = {
  at: "2026-10-29T14:03:11.000Z", durationMs: 21_400, status: "ok", model: "gemini-1.5-flash",
  inputTokens: 2600, outputTokens: 5100, costMicros: 120_000, httpStatus: null, errorKind: null,
};
const realisticReport: AdminAiReport = {
  since: "2026-10-23T00:00:00.000Z", until: "2026-10-30T00:00:00.000Z", truncated: false,
  features: [{
    feature: "quiz-generation", requests: 86, errors: 1, errorRate: 1 / 86, localRequests: 0,
    p50Ms: 4200, p95Ms: 21_400, p50AboveMs: null, p95AboveMs: null, timedCount: 85, stages: null, inputTokens: 223_600, outputTokens: 438_600, costMicros: 8_310_000,
    notable: { slowest: [notableRow], costliest: [notableRow], failures: [] }, modelCounts: { "gemini-1.5-flash": 86 },
  }],
  total: { requests: 86, errors: 1, inputTokens: 223_600, outputTokens: 438_600, costMicros: 8_310_000, chargeMicros: 8_770_000, unknownCostRows: 0 },
  models: [{ model: "gemini-1.5-flash", requests: 86, totalDurationMs: 2_468_000, p50Ms: 3100, p95Ms: 21_400, p50AboveMs: null, p95AboveMs: null, inputTokens: 223_600, outputTokens: 438_600, costMicros: 8_310_000, fallbacks: 5 }],
  students: [
    { shortUid: "a1b2c3d4…", requests: 186, chargeMicros: 6_420_000 },
    { shortUid: "f9e8d7c6…", requests: 142, chargeMicros: 4_910_000 },
  ],
  missingDays: [],
  money: {
    cashCollectedMicros: 184_000_000, creditGrantedMicros: 173_120_000, cashRefundedMicros: 20_000_000,
    netCashMicros: 164_000_000, trialGrantedMicros: 25_000_000, creditRefundedMicros: 1_800_000,
    costMicros: 8_310_000, chargeMicros: 8_770_000, marginMicros: 460_000, unusedBalanceMicros: 96_400_000, unusedBalanceAsOf: "2026-10-29",
  },
  source: "snapshot", builtAt: "2026-10-29T23:40:00.000Z", staleReason: "quota",
};

it("the response carries no full uid", async () => {
  mocks.report.mockResolvedValueOnce(realisticReport);
  const res = await GET(req("?days=7"));
  const body = (await res.json()) as AdminAiReport;
  expect(body.students.length).toBeGreaterThan(0);
  for (const s of body.students) expect(s.shortUid).toMatch(/…$/);
  // Values only: some field names (creditRefundedMicros) are 20 letters long themselves.
  const strings: string[] = [];
  JSON.stringify(body, (_key, value) => {
    if (typeof value === "string") strings.push(value);
    return value;
  });
  expect(strings.length).toBeGreaterThan(10);
  for (const s of strings) expect(s).not.toMatch(/[A-Za-z0-9]{20,}/);
});
it("reports an exhausted quota as its own message, not the generic one", async () => {
  const quotaErrors = [
    Object.assign(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."), { code: 8 }),
    { code: 8, message: "8 RESOURCE_EXHAUSTED: Quota exceeded." },
    new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."),
    Object.assign(new Error("Quota exceeded."), { code: 8 }),
  ];
  for (const error of quotaErrors) {
    mocks.report.mockRejectedValueOnce(error);
    const res = await GET(req("?days=7"));
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("private, no-store");
    const { error: message } = await res.json();
    expect(message).toMatch(/daily Firestore (read )?quota/i);
    expect(message).toMatch(/midnight Pacific/);
    expect(message).not.toBe("Monitoring is temporarily unavailable.");
  }
});
it("keeps the generic message for any other failure", async () => {
  mocks.report.mockRejectedValueOnce(Object.assign(new Error("14 UNAVAILABLE: No connection"), { code: 14 }));
  const res = await GET(req("?days=7"));
  expect(res.status).toBe(503);
  expect(await res.json()).toEqual({ error: "Monitoring is temporarily unavailable." });
});
