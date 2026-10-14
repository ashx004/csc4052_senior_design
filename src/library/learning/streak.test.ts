import { describe, expect, it } from "vitest";
import { computeStudyStreak } from "./streak";

describe("computeStudyStreak", () => {
  it("counts a streak ending today", () => {
    const result = computeStudyStreak(
      ["2026-10-11", "2026-10-12", "2026-10-13"],
      new Date("2026-10-13T12:00:00"),
    );
    expect(result.count).toBe(3);
  });

  it("keeps a streak alive when today has not been studied yet", () => {
    const result = computeStudyStreak(
      ["2026-10-10", "2026-10-11", "2026-10-12"],
      new Date("2026-10-13T08:00:00"),
    );
    expect(result.count).toBe(3);
  });

  it("returns zero after a full missed day", () => {
    expect(computeStudyStreak(["2026-10-10"], new Date("2026-10-13T12:00:00")).count).toBe(0);
  });

  it("returns zero for no studied days", () => {
    const result = computeStudyStreak([], new Date("2026-10-13T12:00:00"));
    expect(result.count).toBe(0);
    expect(result.week).toHaveLength(7);
  });

  it("builds the Monday-to-Sunday week with today and future flags", () => {
    const result = computeStudyStreak(["2026-10-12"], new Date("2026-10-14T12:00:00"));
    expect(result.week.map((d) => d.date)).toEqual([
      "2026-10-12", "2026-10-13", "2026-10-14", "2026-10-15",
      "2026-10-16", "2026-10-17", "2026-10-18",
    ]);
    expect(result.week.map((d) => d.weekday)).toEqual(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]);
    expect(result.week.map((d) => d.studied)).toEqual([true, false, false, false, false, false, false]);
    expect(result.week.map((d) => d.isToday)).toEqual([false, false, true, false, false, false, false]);
    expect(result.week.map((d) => d.isFuture)).toEqual([false, false, false, true, true, true, true]);
  });

  it("handles a streak crossing a month boundary", () => {
    const result = computeStudyStreak(
      ["2026-09-29", "2026-09-30", "2026-10-01"],
      new Date("2026-10-01T09:00:00"),
    );
    expect(result.count).toBe(3);
  });
});
