import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const reportingMocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  getAnalyticsReport: vi.fn(),
}));
vi.mock("@/src/library/adminAuth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/adminAuth")>()),
  requireAdmin: reportingMocks.requireAdmin,
}));
vi.mock("@/src/library/analyticsReports", () => ({
  getAnalyticsReport: reportingMocks.getAnalyticsReport,
}));
import { AdminAccessError } from "@/src/library/adminAuth";
import { GET } from "./route";
beforeEach(() => {
  vi.clearAllMocks();
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
