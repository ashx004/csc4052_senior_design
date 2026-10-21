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
const reportingMocks = vi.hoisted(() => ({
  batchRunReports: vi.fn(),
  runRealtimeReport: vi.fn(),
  saveUserCounts: vi.fn(),
}));
vi.mock("googleapis/build/src/apis/analyticsdata", () => ({
  auth: { GoogleAuth: class {} },
}));
vi.mock("googleapis/build/src/apis/analyticsdata/v1beta", () => ({
  analyticsdata_v1beta: {
    Analyticsdata: class {
      properties = {
        batchRunReports: reportingMocks.batchRunReports,
        runRealtimeReport: reportingMocks.runRealtimeReport,
      };
    },
  },
}));
vi.mock("./analyticsPeaks", () => ({
  saveUserCounts: reportingMocks.saveUserCounts,
}));
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  reportingMocks.saveUserCounts.mockResolvedValue({
    concurrent: 9,
    daily: 25,
    since: "2026-01-01",
  });
  vi.stubEnv("GA4_PROPERTY_ID", "123");
  vi.stubEnv("GA4_PROPERTY_TIMEZONE", "America/Chicago");
  vi.stubEnv("GA4_CLIENT_EMAIL", "test");
  vi.stubEnv("GA4_PRIVATE_KEY", "test");
  reportingMocks.batchRunReports.mockResolvedValue({
    data: {
      reports: [
        { rows: [] },
        { rows: [] },
        { rows: [] },
        { rows: [] },
        { rows: [] },
      ],
    },
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
    data: { reports: [{ metadata: { timeZone: "UTC" } }, {}, {}, {}, {}] },
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
  finish({ data: { reports: [{}, {}, {}, {}, {}] } });
  await Promise.all(pending);
  await expect(
    getAnalyticsReport("2026-01-11", "2026-01-20"),
  ).resolves.toMatchObject({ events: [] });
});

it("rejects invalid counts instead of displaying corrupted totals", async () => {
  const { getAnalyticsReport } = await import("./analyticsReports");
  reportingMocks.batchRunReports.mockResolvedValueOnce({
    data: {
      reports: [
        { rows: [{ metricValues: [{ value: "NaN" }] }] },
        {},
        {},
        {},
        {},
      ],
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

it("uses GA4's distinct active user total instead of adding daily users", async () => {
  reportingMocks.batchRunReports.mockResolvedValueOnce({
    data: {
      reports: [
        {},
        {},
        {
          rows: [
            {
              dimensionValues: [{ value: "20260101" }],
              metricValues: [{ value: "12" }, { value: "8" }],
            },
          ],
        },
        { rows: [{ metricValues: [{ value: "15" }] }] },
        {
          rows: ["20260101", "20260102"].map((date) => ({
            dimensionValues: [{ value: date }],
            metricValues: [{ value: "10" }],
          })),
        },
      ],
    },
  });
  const { getAnalyticsReport } = await import("./analyticsReports");
  const report = await getAnalyticsReport("2026-01-01", "2026-01-02");
  expect(report.activeUsers).toBe(15);
  expect(report.dailyUsers).toHaveLength(2);
  expect(report.dailyPageViews[0].count).toBe(8);
  expect(reportingMocks.saveUserCounts).toHaveBeenCalledWith(
    "123",
    null,
    report.dailyUsers,
  );
});

it("preserves a report but marks failed history writes", async () => {
  reportingMocks.saveUserCounts.mockRejectedValue(new Error("Firestore down"));
  const { getAnalyticsReport } = await import("./analyticsReports");
  expect(await getAnalyticsReport("2026-01-01", "2026-01-02")).toMatchObject({
    activeUsers: 0,
    storageAvailable: false,
  });
});

it("samples one distinct five-minute user count and shares realtime requests", async () => {
  reportingMocks.runRealtimeReport.mockResolvedValue({
    data: {
      metricHeaders: [{ name: "activeUsers" }],
      rows: [{ metricValues: [{ value: "7" }] }],
    },
  });
  const { getRealtimeReport } = await import("./analyticsReports");
  const [report] = await Promise.all([
    getRealtimeReport(),
    getRealtimeReport(),
  ]);
  expect(report).toMatchObject({
    concurrentUsers: 7,
    windowMinutes: 5,
    storageAvailable: true,
  });
  expect(reportingMocks.runRealtimeReport).toHaveBeenCalledTimes(1);
  expect(reportingMocks.runRealtimeReport.mock.calls[0][0].requestBody).toEqual(
    {
      metrics: [{ name: "activeUsers" }],
      minuteRanges: [{ startMinutesAgo: 4, endMinutesAgo: 0 }],
    },
  );
  expect(reportingMocks.saveUserCounts).toHaveBeenCalledWith(
    "123",
    7,
    [],
    expect.any(String),
  );
  expect(await getRealtimeReport()).toBe(report);
});

it("distinguishes empty realtime data, broken reports, and unavailable persistence", async () => {
  const { getRealtimeReport } = await import("./analyticsReports");
  for (const response of [
    {},
    {
      metricHeaders: [{ name: "activeUsers" }],
      rows: [{ metricValues: [{ value: "-1" }] }],
    },
  ]) {
    reportingMocks.runRealtimeReport.mockResolvedValueOnce({ data: response });
    await expect(getRealtimeReport()).rejects.toMatchObject({ status: 502 });
  }
  reportingMocks.runRealtimeReport.mockResolvedValue({
    data: { metricHeaders: [{ name: "activeUsers" }], rows: [] },
  });
  reportingMocks.saveUserCounts.mockRejectedValue(new Error("storage offline"));
  expect(await getRealtimeReport()).toMatchObject({
    concurrentUsers: 0,
    peaks: null,
    storageAvailable: false,
  });
});

it("does not turn realtime permission and timeout failures into zero users", async () => {
  const { getRealtimeReport } = await import("./analyticsReports");
  reportingMocks.runRealtimeReport.mockRejectedValueOnce({
    response: { status: 403 },
  });
  await expect(getRealtimeReport()).rejects.toMatchObject({ status: 503 });
  reportingMocks.runRealtimeReport.mockRejectedValueOnce(new Error("timeout"));
  await expect(getRealtimeReport()).rejects.toMatchObject({ status: 502 });
  expect(reportingMocks.saveUserCounts).not.toHaveBeenCalled();
});
