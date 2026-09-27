import { describe, it, expect } from "vitest";
import {
  mondayOf,
  weekDateKeys,
  roundUpToNiceMinutes,
  computeRuler,
  barHeight,
  formatDuration,
} from "./weeklyRuler";

describe("mondayOf / weekDateKeys (local, America/Chicago in tests)", () => {
  it("finds Monday for a mid-week date", () => {
    // 2026-09-27 is a Sunday; its week's Monday is 2026-09-21
    const mon = mondayOf(new Date("2026-09-27T12:00:00"));
    expect(mon.getFullYear()).toBe(2026);
    expect(mon.getMonth()).toBe(8); // September (0-based)
    expect(mon.getDate()).toBe(21);
  });
  it("returns 7 keys Mon..Sun", () => {
    const keys = weekDateKeys(mondayOf(new Date("2026-09-27T12:00:00")));
    expect(keys).toEqual([
      "2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24",
      "2026-09-25", "2026-09-26", "2026-09-27",
    ]);
  });
});

describe("roundUpToNiceMinutes", () => {
  it("rounds up to the ladder", () => {
    expect(roundUpToNiceMinutes(20)).toBe(30);
    expect(roundUpToNiceMinutes(30)).toBe(30);
    expect(roundUpToNiceMinutes(31)).toBe(45);
    expect(roundUpToNiceMinutes(200)).toBe(240);
  });
  it("clamps above the top step", () => {
    expect(roundUpToNiceMinutes(99999)).toBe(720);
  });
  it("gives a small floor for an all-zero week", () => {
    expect(roundUpToNiceMinutes(0)).toBe(15);
  });
});

describe("computeRuler", () => {
  it("20m vs 600m: niceMax 600, 20m much shorter", () => {
    const { niceMax } = computeRuler([20, 0, 600, 0, 0, 0, 0]);
    expect(niceMax).toBe(600);
    const h20 = barHeight(20, niceMax, 140);
    const h600 = barHeight(600, niceMax, 140);
    expect(h600).toBeGreaterThan(h20 * 5);
  });
  it("emits labeled ticks starting at 0", () => {
    const { ticks } = computeRuler([120, 0, 0, 0, 0, 0, 0]);
    expect(ticks[0]).toEqual({ minutes: 0, label: "0" });
    expect(ticks[ticks.length - 1].minutes).toBe(120);
  });
});

describe("barHeight", () => {
  it("zero minutes => 0 height", () => {
    expect(barHeight(0, 120, 140)).toBe(0);
  });
  it("nonzero keeps a minimum visible sliver", () => {
    expect(barHeight(1, 600, 140, 6)).toBeGreaterThanOrEqual(6);
  });
});

describe("formatDuration", () => {
  it("formats hours and minutes", () => {
    expect(formatDuration(135)).toBe("2h 15m");
    expect(formatDuration(15)).toBe("15m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(0)).toBe("0m");
  });
});
