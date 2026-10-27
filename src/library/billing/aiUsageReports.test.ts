import { beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ select: vi.fn(), get: vi.fn(), limit: vi.fn(), where: vi.fn(), orderBy: vi.fn() }));
vi.mock("../firebaseAdmin", () => {
  const q: Record<string, unknown> = {};
  mocks.where.mockReturnValue(q); mocks.orderBy.mockReturnValue(q); mocks.limit.mockReturnValue(q);
  q.where = mocks.where; q.orderBy = mocks.orderBy; q.limit = mocks.limit; q.select = mocks.select.mockReturnValue(q); q.get = mocks.get;
  return { adminDb: { collection: () => q } };
});
import { loadUsageRows, getAiPerformanceReport } from "./aiUsageReports";

const doc = (data: object) => ({ data: () => data });
beforeEach(() => { mocks.get.mockReset(); mocks.where.mockClear(); mocks.orderBy.mockClear(); mocks.limit.mockClear(); });

it("maps historical rows missing new fields", async () => {
  mocks.get.mockResolvedValue({ size: 1, docs: [doc({ feature: "chat", model: "m", costMicros: 5, at: { toDate: () => new Date(1000) } })] });
  const { rows, truncated } = await loadUsageRows(7);
  expect(truncated).toBe(false);
  expect(rows[0]).toMatchObject({ durationMs: null, waitMs: null, genMs: null, deliverMs: null, status: "ok" });
  const [field, op, cutoff] = mocks.where.mock.calls[0];
  expect([field, op]).toEqual(["at", ">="]);
  expect(Math.abs(Date.now() - 7 * 86_400_000 - (cutoff as Date).getTime())).toBeLessThan(5_000);
  expect(mocks.orderBy).toHaveBeenCalledWith("at", "desc");
  expect(mocks.limit).toHaveBeenCalledWith(50_000);
  const report = await getAiPerformanceReport(7);
  expect(report.features[0].feature).toBe("chat");
});
it("flags truncation at the cap", async () => {
  mocks.get.mockResolvedValue({ size: 50_000, docs: [] });
  expect((await loadUsageRows(1)).truncated).toBe(true);
});
it("reads legacy boolean incomplete as a stopped stream", async () => {
  mocks.get.mockResolvedValue({ size: 3, docs: [doc({ incomplete: true }), doc({ incomplete: false }), doc({ status: "error", incomplete: true })] });
  const { rows } = await loadUsageRows(1);
  expect(rows.map((r) => r.status)).toEqual(["incomplete", "ok", "error"]);
});
it("carries charge and cost source, and marks unrecorded ones unknown", async () => {
  mocks.get.mockResolvedValue({ size: 2, docs: [doc({ costMicros: 100, chargeMicros: 106, costSource: "provider" }), doc({ costMicros: 100 })] });
  const { rows } = await loadUsageRows(1);
  expect(rows[0]).toMatchObject({ costMicros: 100, chargeMicros: 106, costSource: "provider" });
  expect(rows[1].costSource).toBe("unknown");
  expect(rows[0]).not.toHaveProperty("uid");
});
it("projects only the fields the summary needs, never uid", async () => {
  mocks.get.mockResolvedValue({ size: 0, docs: [] });
  await loadUsageRows(1);
  const fields = mocks.select.mock.calls[0];
  expect(fields).toContain("chargeMicros");
  expect(fields).not.toContain("uid");
});
