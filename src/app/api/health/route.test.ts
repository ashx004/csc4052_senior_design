import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getHealthReport: vi.fn() }));
vi.mock("@/src/library/monitoring/healthChecks", () => ({ getHealthReport: mocks.getHealthReport }));

import { GET, HEAD } from "./route";

const check = (ok: boolean) => ({ ok, ms: 5 });

beforeEach(() => vi.clearAllMocks());

it("returns 200 when everything is up", async () => {
  mocks.getHealthReport.mockResolvedValue({ status: "ok", checkedAt: "", checks: { database: check(true), storage: check(true), ai: check(true) } });
  const response = await GET();
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("no-store");
  expect((await HEAD()).status).toBe(200);
});

it("returns 503 so the uptime monitor alerts when anything is down", async () => {
  mocks.getHealthReport.mockResolvedValue({ status: "down", checkedAt: "", checks: { database: check(true), storage: check(true), ai: check(false) } });
  const response = await GET();
  expect(response.status).toBe(503);
  expect((await response.json()).checks.ai.ok).toBe(false);
  expect((await HEAD()).status).toBe(503);
});
