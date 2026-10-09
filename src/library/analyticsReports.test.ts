import { beforeEach, afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("./analyticsReportingConfig", () => ({
  getReportingConfiguration: () => {
    if (!process.env.GA4_PROPERTY_ID)
      throw Object.assign(new Error("Not configured"), { status: 503 });
    return {
      propertyId: process.env.GA4_PROPERTY_ID,
      timeZone: "America/Chicago",
      clientEmail: "test",
      privateKey: "test",
    };
  },
}));
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

it("shares concurrent identical report requests", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  await Promise.all(
    Array.from({ length: 8 }, () =>
      getAnalyticsReport("2026-01-01", "2026-01-05"),
    ),
  );
  expect(reportingMocks.batchRunReports).toHaveBeenCalledTimes(1);
});

it("bounds distinct in-flight reports and frees capacity after completion", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  let finish!: (response: unknown) => void;
  reportingMocks.batchRunReports.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const pending = Array.from({ length: 10 }, (_, index) => {
    const day = String(index + 1).padStart(2, "0");
    return getAnalyticsReport(`2026-01-${day}`, "2026-01-20");
  });
  await expect(
    getAnalyticsReport("2026-01-11", "2026-01-20"),
  ).rejects.toMatchObject({ status: 429 });
  expect(reportingMocks.batchRunReports).toHaveBeenCalledTimes(10);
  finish({ data: { reports: [{}, {}, {}] } });
  await Promise.all(pending);
  await expect(
    getAnalyticsReport("2026-01-11", "2026-01-20"),
  ).resolves.toMatchObject({ events: [] });
});

it("rejects invalid counts instead of displaying corrupted totals", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  reportingMocks.batchRunReports.mockResolvedValueOnce({
    data: {
      reports: [{ rows: [{ metricValues: [{ value: "NaN" }] }] }, {}, {}],
    },
  });
  await expect(
    getAnalyticsReport("2026-01-01", "2026-01-05"),
  ).rejects.toMatchObject({ status: 502 });
});

it("rejects reversed, future, and oversized date ranges before Google is called", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  for (const [start, end] of [
    ["2026-01-05", "2026-01-01"],
    ["2026-01-01", "2099-01-01"],
    ["2024-01-01", "2026-01-01"],
  ]) {
    await expect(getAnalyticsReport(start, end)).rejects.toMatchObject({
      status: 400,
    });
  }
  expect(reportingMocks.batchRunReports).not.toHaveBeenCalled();
});
