import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const reportingMocks = vi.hoisted(() => ({ batchRunReports: vi.fn() }));
vi.mock("googleapis/build/src/apis/analyticsdata", () => ({
  auth: { GoogleAuth: class {} },
}));
vi.mock("googleapis/build/src/apis/analyticsdata/v1beta", () => ({
  analyticsdata_v1beta: {
    Analyticsdata: class {
      properties = { batchRunReports: reportingMocks.batchRunReports };
    },
  },
}));
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("GA4_PROPERTY_ID", "123");
  vi.stubEnv("GA4_PROPERTY_TIMEZONE", "America/Chicago");
  vi.stubEnv("GA4_CLIENT_EMAIL", "test");
  vi.stubEnv("GA4_PRIVATE_KEY", "test");
  reportingMocks.batchRunReports.mockResolvedValue({
    data: { reports: [{ rows: [] }, { rows: [] }, { rows: [] }] },
  });
});

afterEach(() => vi.unstubAllEnvs());
it("returns empty real reports and caches identical queries", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  const report = await getAnalyticsReport("2026-01-01", "2026-01-05");
  expect(report.events).toEqual([]);
  expect(report.pages).toEqual([]);
  expect(await getAnalyticsReport("2026-01-01", "2026-01-05")).toBe(report);
  expect(reportingMocks.batchRunReports).toHaveBeenCalledTimes(1);
});

it("returns actionable missing-configuration errors without calling Google", async () => {
  vi.stubEnv("GA4_PROPERTY_ID", "");
  const { getAnalyticsReport } = await import("./analyticsReports");
  await expect(
    getAnalyticsReport("2026-01-01", "2026-01-05"),
  ).rejects.toMatchObject({ status: 503 });
  expect(reportingMocks.batchRunReports).not.toHaveBeenCalled();
});

it("handles permissions, quotas, outages and incomplete responses", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  for (const [upstreamStatus, expectedStatus] of [
    [403, 503],
    [429, 429],
    [500, 502],
  ]) {
    reportingMocks.batchRunReports.mockRejectedValueOnce({
      response: { status: upstreamStatus },
    });
    await expect(
      getAnalyticsReport("2026-01-01", "2026-01-05"),
    ).rejects.toMatchObject({ status: expectedStatus });
  }
  reportingMocks.batchRunReports.mockResolvedValueOnce({ data: {} });
  await expect(
    getAnalyticsReport("2026-01-01", "2026-01-05"),
  ).rejects.toMatchObject({ status: 502 });
});

it("rejects timezone mismatches instead of displaying misleading dates", async () => {
  reportingMocks.batchRunReports.mockResolvedValueOnce({
    data: { reports: [{ metadata: { timeZone: "UTC" } }, {}, {}] },
  });
  const { getAnalyticsReport } = await import("./analyticsReports");
  await expect(
    getAnalyticsReport("2026-01-01", "2026-01-05"),
  ).rejects.toMatchObject({ status: 503 });
});
