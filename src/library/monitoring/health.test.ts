import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  probeServices: vi.fn(),
  saveServiceStatus: vi.fn(),
  readIncidentHistory: vi.fn(),
  readWorkerHeartbeat: vi.fn(),
}));
vi.mock("./probes", () => ({
  probeServices: mocks.probeServices,
  withDeadline: (operation: Promise<unknown>) => operation,
}));
vi.mock("./store", () => mocks);
beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  mocks.probeServices.mockResolvedValue([
    {
      id: "firestore",
      status: "down",
      checkedAt: "2026-10-20T10:00:00Z",
      latencyMs: 5000,
      message: "Probe failed",
    },
  ]);
  mocks.saveServiceStatus.mockResolvedValue(undefined);
  mocks.readIncidentHistory.mockResolvedValue([]);
  mocks.readWorkerHeartbeat.mockResolvedValue(null);
});
it("shares and caches checks so admin polling does not create a probe storm", async () => {
  const { getHealthReport } = await import("./health");
  const [report, same] = await Promise.all([
    getHealthReport(),
    getHealthReport(),
  ]);
  expect(same).toBe(report);
  expect(await getHealthReport()).toBe(report);
  expect(mocks.probeServices).toHaveBeenCalledTimes(1);
  expect(report.historyAvailable).toBe(true);
  expect(report.incidents).toEqual([]);
});
it("returns live probe failures even when Firestore cannot store or load history", async () => {
  mocks.saveServiceStatus.mockRejectedValue(new Error("unreachable"));
  mocks.readIncidentHistory.mockRejectedValue(new Error("unreachable"));
  const { getHealthReport } = await import("./health");
  expect(await getHealthReport()).toMatchObject({
    historyAvailable: false,
    services: [{ id: "firestore", status: "down" }],
  });
});
