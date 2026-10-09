import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const reportingMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  getAnalyticsReport: vi.fn(),
}));
vi.mock("@/src/library/adminAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/adminAuth")>()),
  requireAdmin: reportingMocks.requireAdmin,
}));
vi.mock("@/src/library/analyticsReports", () => ({
  getAnalyticsReport: reportingMocks.getAnalyticsReport,
}));
vi.mock("@/src/library/rateLimit", () => ({
  checkRateLimit: reportingMocks.checkRateLimit,
}));
import { AdminAccessError } from "@/src/library/adminAuth";
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
  reportingMocks.checkRateLimit.mockReturnValue({ allowed: true });
  reportingMocks.requireAdmin.mockResolvedValue({ uid: "admin" });
  reportingMocks.getAnalyticsReport.mockResolvedValue({ events: [] });
});

it("authorizes every request before accessing even a cached report", async () => {
  await GET(new NextRequest("https://catalyst.test/api/admin/analytics"));
  expect(reportingMocks.requireAdmin.mock.invocationCallOrder[0]).toBeLessThan(
    reportingMocks.getAnalyticsReport.mock.invocationCallOrder[0],
  );
  reportingMocks.requireAdmin.mockRejectedValue(
    new AdminAccessError(403, "Access revoked"),
  );
  const response = await GET(
    new NextRequest("https://catalyst.test/api/admin/analytics"),
  );
  expect(response.status).toBe(403);
  expect(reportingMocks.getAnalyticsReport).toHaveBeenCalledTimes(1);
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

it("rejects arbitrary property and query parameters", async () => {
  const response = await GET(
    new NextRequest("https://catalyst.test/api/admin/analytics?property=other"),
  );
  expect(response.status).toBe(400);
  expect(reportingMocks.getAnalyticsReport).not.toHaveBeenCalled();
});

it("rejects duplicate query parameters", async () => {
  const response = await GET(
    new NextRequest(
      "https://catalyst.test/api/admin/analytics?start=7days&start=30days",
    ),
  );
  expect(response.status).toBe(400);
  expect(reportingMocks.getAnalyticsReport).not.toHaveBeenCalled();
});

it("limits requests after authentication and returns a retry delay", async () => {
  reportingMocks.checkRateLimit.mockReturnValue({
    allowed: false,
    retryAfterSeconds: 45,
  });
  const response = await GET(
    new NextRequest("https://catalyst.test/api/admin/analytics"),
  );
  expect(response.status).toBe(429);
  expect(response.headers.get("Retry-After")).toBe("45");
  expect(reportingMocks.getAnalyticsReport).not.toHaveBeenCalled();
});

it("never leaks unexpected backend errors", async () => {
  reportingMocks.getAnalyticsReport.mockRejectedValueOnce(
    new Error("secret credentials"),
  );
  const response = await GET(
    new NextRequest("https://catalyst.test/api/admin/analytics"),
  );
  expect(response.status).toBe(503);
  expect(JSON.stringify(await response.json())).not.toContain(
    "secret credentials",
  );
});
