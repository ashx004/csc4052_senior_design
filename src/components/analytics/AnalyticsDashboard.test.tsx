// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import AnalyticsDashboard from "./AnalyticsDashboard";
import type { AnalyticsReport } from "@/src/library/analyticsReportContract";
import type { HealthReport } from "@/src/library/monitoring/types";
const report: AnalyticsReport = {
  startDate: "2026-10-14",
  endDate: "2026-10-20",
  timeZone: "America/Chicago",
  retrievedAt: "2026-10-20T12:00:00Z",
  pages: [],
  events: [],
  daily: [],
  dailyPageViews: [],
  activeUsers: 0,
  dailyUsers: [],
  limited: false,
  storageAvailable: true,
};
const health: HealthReport = {
  services: [
    {
      id: "firestore",
      status: "down",
      message: "Service check failed",
      checkedAt: "2026-10-20T12:00:00Z",
      latencyMs: 5000,
    },
  ],
  incidents: [],
  checkedAt: "2026-10-20T12:00:00Z",
  historyAvailable: false,
  workerLastSeen: null,
};
const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("realtime"))
      return Response.json({
        concurrentUsers: 0,
        windowMinutes: 5,
        checkedAt: "2026-10-20T12:00:00Z",
        peaks: null,
        storageAvailable: false,
      });
    if (url.includes("health")) return Response.json(health);
    return Response.json(report);
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

it("renders true empty analytics separately from missing peaks and failed health history", async () => {
  render(<AnalyticsDashboard />);
  await screen.findByText("No recorded activity for this period.");
  expect(screen.getByText("No saved peak available")).toBeTruthy();
  expect(screen.getByText("Firestore · Unavailable")).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Service health" }),
  );
  expect(
    screen.getByText(/incident history could not be read or saved/),
  ).toBeTruthy();
  expect(
    screen.queryByText("No interruptions have been recorded yet."),
  ).toBeNull();
});

it("lets admins inspect service health when GA4 is unavailable", async () => {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes("health")
      ? Response.json(health)
      : Response.json(
          { error: "Reporting access is unavailable." },
          { status: 503 },
        ),
  );
  render(<AnalyticsDashboard />);
  await screen.findByText("Reporting access is unavailable.");
  fireEvent.click(
    screen.getByRole("button", { name: "Service health" }),
  );
  expect(screen.getByText("Service check failed")).toBeTruthy();
  expect(
    screen.queryByText("No recorded activity for this period."),
  ).toBeNull();
});

it("applies date filters, searches real event rows and expands their descriptions", async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("health")) return Response.json(health);
    if (url.includes("realtime"))
      return Response.json({
        concurrentUsers: 0,
        windowMinutes: 5,
        checkedAt: "2026-10-20T12:00:00Z",
        peaks: null,
        storageAvailable: false,
      });
    return Response.json({
      ...report,
      events: [
        { label: "quiz_completed", count: 10 },
        { label: "page_view", count: 20 },
      ],
    });
  });
  render(<AnalyticsDashboard />);
  await screen.findByText("No recorded activity for this period.");
  fireEvent.change(screen.getByLabelText("Date range"), {
    target: { value: "30days" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Apply / refresh" }));
  await waitFor(() =>
    expect(
      fetchMock.mock.calls.some(([url]) => url.includes("start=30days")),
    ).toBe(true),
  );
  fireEvent.click(screen.getByRole("button", { name: "Event explorer" }));
  await screen.findByText("Explore tracked events");
  fireEvent.change(screen.getByLabelText("Search events"), {
    target: { value: "quiz" },
  });
  expect(screen.queryByText("page_view")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Quiz completed/ }));
  expect(screen.getByText(/A student finishes a quiz/)).toBeTruthy();
});
