import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  checkRateLimit: vi.fn(),
  health: vi.fn(),
  realtime: vi.fn(),
}));
vi.mock("@/src/library/adminAuth", async (original) => ({
  ...(await original<typeof import("@/src/library/adminAuth")>()),
  requireAdmin: mocks.requireAdmin,
}));
vi.mock("@/src/library/rateLimit", () => ({
  checkRateLimit: mocks.checkRateLimit,
}));
vi.mock("@/src/library/monitoring/health", () => ({
  getHealthReport: mocks.health,
}));
vi.mock("@/src/library/analyticsReports", () => ({
  getRealtimeReport: mocks.realtime,
}));
import { AdminAccessError } from "@/src/library/adminAuth";
import { GET as health } from "./route";
import { GET as realtime } from "../analytics/realtime/route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.requireAdmin.mockResolvedValue({ uid: "admin" });
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
  mocks.health.mockResolvedValue({ services: [] });
  mocks.realtime.mockResolvedValue({ concurrentUsers: 0 });
});
for (const [name, route, load] of [
  ["health", health, mocks.health],
  ["realtime", realtime, mocks.realtime],
] as const) {
  const request = () =>
    new NextRequest(`https://catalyst.test/api/admin/${name}`);
  it(`${name}: denies logged-out, ordinary and revoked accounts before probing or reading cached data`, async () => {
    for (const status of [401, 403] as const) {
      mocks.requireAdmin.mockRejectedValueOnce(
        new AdminAccessError(status, "Access denied"),
      );
      expect((await route(request())).status).toBe(status);
    }
    expect(load).not.toHaveBeenCalled();
    const allowed = await route(request());
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.requireAdmin.mock.invocationCallOrder[2]).toBeLessThan(
      load.mock.invocationCallOrder[0],
    );
  });
  it(`${name}: rate limits admins and hides unexpected errors`, async () => {
    mocks.checkRateLimit.mockReturnValueOnce({
      allowed: false,
      retryAfterSeconds: 20,
    });
    const limited = await route(request());
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("20");
    expect(load).not.toHaveBeenCalled();
    load.mockRejectedValueOnce(new Error("private key and secret URL"));
    const failed = await route(request());
    expect(failed.status).toBe(503);
    expect(await failed.text()).not.toContain("secret");
  });
}
