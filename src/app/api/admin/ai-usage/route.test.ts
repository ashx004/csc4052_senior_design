import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), checkRateLimit: vi.fn(), report: vi.fn() }));
vi.mock("@/src/library/adminAuth", async (original) => ({
  ...(await original<typeof import("@/src/library/adminAuth")>()),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/src/library/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/src/library/billing/aiUsageReports", () => ({ getAiPerformanceReport: mocks.report }));
import { AdminAccessError } from "@/src/library/adminAuth";
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
it("returns per-feature statistics for an admin", async () => {
  const res = await GET(req("?days=31"));
  expect(res.status).toBe(200);
  expect(res.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await res.json()).features[0]).toMatchObject({ feature: "chat", requests: expect.any(Number) });
  expect(mocks.report).toHaveBeenCalledWith(31);
});
