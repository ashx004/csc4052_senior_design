import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  buildAndStoreDay: vi.fn(),
  readDays: vi.fn(),
  writeSnapshot: vi.fn(),
}));

// dayKey/dayKeysBack stay real so "yesterday" and "the last 31 days" are checked, not assumed.
vi.mock("@/src/library/billing/rollupStore", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/src/library/billing/rollupStore")>()),
  buildAndStoreDay: mocks.buildAndStoreDay,
  readDays: mocks.readDays,
  writeSnapshot: mocks.writeSnapshot,
}));

import { POST } from "./route";

const SECRET = "test-internal-secret";
const NOW = new Date("2026-10-30T08:20:00.000Z");

function req(query = "", headers: Record<string, string> = { "x-internal-secret": SECRET }) {
  return new NextRequest(`http://localhost/api/internal/ai-rollup${query}`, { method: "POST", headers });
}

const rollup = (day: string) => ({ day, rowsRead: 42, truncated: false });

describe("POST /api/internal/ai-rollup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    vi.stubEnv("INTERNAL_API_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.buildAndStoreDay.mockImplementation(async (day: string) => rollup(day));
    mocks.readDays.mockImplementation(async (keys: string[]) => ({ rollups: keys.slice(0, 2).map(rollup), missing: keys.slice(2) }));
    mocks.writeSnapshot.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("rejects a request without the internal secret", async () => {
    expect((await POST(req("", {}))).status).toBe(401);
    expect((await POST(req("", { "x-internal-secret": "wrong" }))).status).toBe(401);
    expect(mocks.buildAndStoreDay).not.toHaveBeenCalled();
    expect(mocks.writeSnapshot).not.toHaveBeenCalled();
  });

  it("reports a missing server secret as unconfigured rather than unauthorized", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "");
    expect((await POST(req())).status).toBe(503);
    expect(mocks.buildAndStoreDay).not.toHaveBeenCalled();
  });

  it("builds yesterday's UTC day by default and snapshots the last 31 day documents", async () => {
    const response = await POST(req());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ day: "2026-10-29", rowsRead: 42, truncated: false, snapshotWritten: true });
    expect(mocks.buildAndStoreDay).toHaveBeenCalledExactlyOnceWith("2026-10-29");
    const keys = mocks.readDays.mock.calls[0][0] as string[];
    expect(keys).toHaveLength(31);
    expect(keys[0]).toBe("2026-10-29");
    expect(keys[30]).toBe("2026-09-29");
    expect(mocks.writeSnapshot).toHaveBeenCalledExactlyOnceWith([rollup("2026-10-29"), rollup("2026-10-28")]);
    expect(mocks.buildAndStoreDay.mock.invocationCallOrder[0]).toBeLessThan(mocks.readDays.mock.invocationCallOrder[0]);
  });

  it("uses the UTC day, not the local one, just after UTC midnight", async () => {
    // 00:05 UTC on the 30th is still the evening of the 29th in Chicago (the test TZ).
    vi.setSystemTime(new Date("2026-10-30T00:05:00.000Z"));
    await POST(req());
    expect(mocks.buildAndStoreDay).toHaveBeenCalledExactlyOnceWith("2026-10-29");
  });

  it("accepts an explicit ?day= for a backfill", async () => {
    const response = await POST(req("?day=2026-10-20"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ day: "2026-10-20", rowsRead: 42, truncated: false, snapshotWritten: true });
    expect(mocks.buildAndStoreDay).toHaveBeenCalledExactlyOnceWith("2026-10-20");
    // The snapshot is always the latest 31 days, whichever day was rebuilt.
    expect((mocks.readDays.mock.calls[0][0] as string[])[0]).toBe("2026-10-29");
  });

  it.each(["last-tuesday", "", "2026-10-2", "2026-13-01", "2026-02-30", "2026-10-20T00:00:00Z", " 2026-10-20"])(
    "rejects a malformed day %j",
    async (day) => {
      const response = await POST(req(`?day=${encodeURIComponent(day)}`));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: expect.any(String) });
      expect(mocks.buildAndStoreDay).not.toHaveBeenCalled();
    },
  );

  it.each(["2026-10-30", "2026-10-31", "2027-01-01"])("rejects today or a future day %s", async (day) => {
    expect((await POST(req(`?day=${day}`))).status).toBe(400);
    expect(mocks.buildAndStoreDay).not.toHaveBeenCalled();
  });

  it("still reports success when the snapshot could not be written", async () => {
    mocks.writeSnapshot.mockResolvedValue(false);

    const response = await POST(req());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ day: "2026-10-29", rowsRead: 42, truncated: false, snapshotWritten: false });
  });

  it("still reports the build when reading the day documents for the snapshot fails", async () => {
    mocks.readDays.mockRejectedValue(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."));

    const response = await POST(req());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ day: "2026-10-29", rowsRead: 42, truncated: false, snapshotWritten: false });
    expect(mocks.writeSnapshot).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("passes a truncated build through", async () => {
    mocks.buildAndStoreDay.mockResolvedValue({ day: "2026-10-29", rowsRead: 20_000, truncated: true });
    await expect((await POST(req())).json()).resolves.toMatchObject({ rowsRead: 20_000, truncated: true });
  });

  it("fails with a short 500 when the build itself fails, without leaking the error", async () => {
    mocks.buildAndStoreDay.mockRejectedValue(new Error("8 RESOURCE_EXHAUSTED: secret internal detail"));

    const response = await POST(req());

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toMatch(/RESOURCE_EXHAUSTED|secret internal detail/);
    expect(mocks.writeSnapshot).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });
});
