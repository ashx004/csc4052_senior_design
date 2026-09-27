import { describe, it, expect } from "vitest";
import {
  resolveMillis,
  computeActiveMinutes,
  computeActiveSeconds,
  computeElapsedSeconds,
} from "./focusTimer";

const ts = (ms: number) => ({ toMillis: () => ms });
const pending = {}; // unresolved serverTimestamp: no toMillis

describe("resolveMillis", () => {
  it("returns null for a pending server timestamp", () => {
    expect(resolveMillis(pending)).toBeNull();
    expect(resolveMillis(null)).toBeNull();
    expect(resolveMillis(undefined)).toBeNull();
  });
  it("returns millis for a resolved timestamp", () => {
    expect(resolveMillis(ts(1000))).toBe(1000);
  });
});

describe("computeActiveMinutes", () => {
  it("sums only fully-resolved closed periods", () => {
    const periods = [
      { startedAt: ts(0), endedAt: ts(600_000) }, // 10 min
      { startedAt: ts(700_000), endedAt: ts(1_000_000) }, // 5 min
    ];
    expect(computeActiveMinutes(periods, 2_000_000)).toBe(15);
  });

  it("treats an open period as running until now (not epoch)", () => {
    const periods = [{ startedAt: ts(1_000_000), endedAt: null }];
    expect(computeActiveMinutes(periods, 1_600_000)).toBe(10);
  });

  it("BUG GUARD: a pending startedAt never counts as epoch time", () => {
    // Previously: start=0, end=1_000_000_000_000 => ~16 million minutes ("1725:00"-class inflation)
    const periods = [{ startedAt: pending, endedAt: ts(1_000_000_000_000) }];
    expect(computeActiveMinutes(periods, 1_000_000_000_001)).toBe(0);
  });

  it("never lets a single period exceed wall-clock now", () => {
    const periods = [{ startedAt: ts(0), endedAt: ts(9_999_999_999_999) }];
    // endedAt beyond now clamps to now
    expect(computeActiveMinutes(periods, 600_000)).toBe(10);
  });
});

describe("computeActiveSeconds", () => {
  it("keeps second precision (no flooring to whole minutes)", () => {
    const periods = [{ startedAt: ts(1_000_000), endedAt: ts(1_065_000) }]; // 65s
    expect(computeActiveSeconds(periods, 1_065_000)).toBe(65);
  });

  it("sums multiple periods with second precision", () => {
    const periods = [
      { startedAt: ts(0), endedAt: ts(65_000) }, // 65s
      { startedAt: ts(100_000), endedAt: ts(130_000) }, // 30s
    ];
    expect(computeActiveSeconds(periods, 200_000)).toBe(95);
  });

  it("treats an open period as running until now", () => {
    const periods = [{ startedAt: ts(1_000_000), endedAt: null }];
    expect(computeActiveSeconds(periods, 1_042_000)).toBe(42);
  });
});

describe("pause/resume keeps the exact second (regression)", () => {
  it("resumes from where it paused, not the floored minute", () => {
    // Study 1:05 (65s), then pause.
    const startedAt = ts(1_000_000);
    const pausedPeriods = [{ startedAt, endedAt: ts(1_065_000) }];
    const activeSeconds = computeActiveSeconds(pausedPeriods, 1_065_000);
    expect(activeSeconds).toBe(65); // NOT floored to 60

    // While paused the card shows 1:05, not 1:00.
    expect(
      computeElapsedSeconds(
        { activeMinutes: 1, activeSeconds, status: "paused", periods: pausedPeriods, startedAt },
        9_999_999
      )
    ).toBe(65);

    // Resume opens a fresh period much later; base stays 65 and counts up.
    const resumedPeriods = [
      ...pausedPeriods,
      { startedAt: ts(5_000_000), endedAt: null },
    ];
    expect(
      computeElapsedSeconds(
        { activeMinutes: 1, activeSeconds, status: "active", periods: resumedPeriods, startedAt },
        5_003_000
      )
    ).toBe(68); // 1:05 + 3s = 1:08
  });
});

describe("computeElapsedSeconds", () => {
  it("uses activeSeconds as the base when present (second precision)", () => {
    const input = {
      activeMinutes: 1,
      activeSeconds: 65,
      status: "active",
      periods: [{ startedAt: ts(1_000_000), endedAt: null }],
      startedAt: ts(1_000_000),
    };
    // base 65 + 10s since open start = 75
    expect(computeElapsedSeconds(input, 1_010_000)).toBe(75);
  });

  it("falls back to activeMinutes*60 for legacy sessions without activeSeconds", () => {
    const input = {
      activeMinutes: 12,
      status: "paused",
      periods: [{ startedAt: ts(0), endedAt: ts(720_000) }],
      startedAt: ts(0),
    };
    expect(computeElapsedSeconds(input, 9_999_999)).toBe(720);
  });

  it("adds seconds since the last open period start", () => {
    const input = {
      activeMinutes: 5,
      status: "active",
      periods: [{ startedAt: ts(1_000_000), endedAt: null }],
      startedAt: ts(0),
    };
    // 5*60 + (1_030_000-1_000_000)/1000 = 300 + 30 = 330
    expect(computeElapsedSeconds(input, 1_030_000)).toBe(330);
  });

  it("returns activeMinutes*60 when paused", () => {
    const input = {
      activeMinutes: 12,
      status: "paused",
      periods: [{ startedAt: ts(0), endedAt: ts(720_000) }],
      startedAt: ts(0),
    };
    expect(computeElapsedSeconds(input, 9_999_999)).toBe(720);
  });

  it("BUG GUARD: pending open-period start does not inflate", () => {
    const input = {
      activeMinutes: 3,
      status: "active",
      periods: [{ startedAt: pending, endedAt: null }],
      startedAt: pending,
    };
    // no resolvable start => 0 seconds since start, just base
    expect(computeElapsedSeconds(input, 1_000_000_000_000)).toBe(180);
  });

  it("falls back to session start when the last period already ended", () => {
    const input = {
      activeMinutes: 4,
      status: "active",
      periods: [{ startedAt: ts(0), endedAt: ts(240_000) }],
      startedAt: ts(1_000_000),
    };
    // 4*60 + seconds since session startedAt
    expect(computeElapsedSeconds(input, 1_045_000)).toBe(285);
  });

  it("BUG GUARD: pending open-period start does not fall back to resolved session start", () => {
    const input = {
      activeMinutes: 3,
      status: "active",
      periods: [{ startedAt: pending, endedAt: null }],
      startedAt: ts(0),
    };
    // resolved session startedAt must not inflate when open period start is pending
    expect(computeElapsedSeconds(input, 1_000_000_000_000)).toBe(180);
  });
});
