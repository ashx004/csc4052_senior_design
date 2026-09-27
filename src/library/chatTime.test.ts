import { describe, expect, it } from "vitest";
import { DEFAULT_TIME_ZONE, describeLocal, localToUtcIso, resolveTimeZone, utcIsoToLocal } from "./chatTime";

const CHI = "America/Chicago";

describe("localToUtcIso", () => {
  it("reads wall time in the student's zone, not the server's", () => {
    // 3 PM Central daylight time = 20:00 UTC (the bug stored 15:00 UTC).
    expect(localToUtcIso("2026-09-26T15:00", CHI)).toBe("2026-09-26T20:00:00.000Z");
    // Standard time in winter is UTC-6.
    expect(localToUtcIso("2026-01-15T09:30", CHI)).toBe("2026-01-15T15:30:00.000Z");
  });

  it("handles a bare date, seconds, and other zones", () => {
    expect(localToUtcIso("2026-09-26", CHI)).toBe("2026-09-26T05:00:00.000Z");
    expect(localToUtcIso("2026-09-26T23:59:59", CHI)).toBe("2026-09-27T04:59:59.000Z");
    expect(localToUtcIso("2026-09-26T15:00", "Asia/Kolkata")).toBe("2026-09-26T09:30:00.000Z");
    expect(localToUtcIso("2026-09-26T15:00", "UTC")).toBe("2026-09-26T15:00:00.000Z");
  });

  it("is right on both sides of a DST change", () => {
    // DST starts 2026-03-08 at 2 AM in Chicago.
    expect(localToUtcIso("2026-03-07T12:00", CHI)).toBe("2026-03-07T18:00:00.000Z");
    expect(localToUtcIso("2026-03-09T12:00", CHI)).toBe("2026-03-09T17:00:00.000Z");
  });

  it("rejects malformed input and explicit offsets", () => {
    expect(localToUtcIso("tomorrow at 3", CHI)).toBeNull();
    expect(localToUtcIso("2026-13-01T10:00", CHI)).toBeNull();
    expect(localToUtcIso("2026-09-26T15:00Z", CHI)).toBeNull();
  });
});

describe("utcIsoToLocal / describeLocal", () => {
  it("round-trips through the student's zone", () => {
    expect(utcIsoToLocal("2026-09-26T20:00:00.000Z", CHI)).toBe("2026-09-26T15:00");
    expect(utcIsoToLocal(localToUtcIso("2026-12-01T08:05", CHI)!, CHI)).toBe("2026-12-01T08:05");
  });

  it("describes times the way a person reads them", () => {
    expect(describeLocal("2026-09-26T20:00:00.000Z", CHI)).toBe("Saturday, September 26, 2026 at 3:00 PM");
    expect(describeLocal("2026-09-26T05:00:00.000Z", CHI, true)).toBe("Saturday, September 26, 2026");
  });
});

describe("resolveTimeZone", () => {
  it("accepts real zones and falls back otherwise", () => {
    expect(resolveTimeZone("Europe/Berlin")).toBe("Europe/Berlin");
    expect(resolveTimeZone("Not/AZone")).toBe(DEFAULT_TIME_ZONE);
    expect(resolveTimeZone(undefined)).toBe(DEFAULT_TIME_ZONE);
  });
});
