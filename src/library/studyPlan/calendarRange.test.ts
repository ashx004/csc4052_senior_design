import { describe, expect, it } from "vitest";
import { getStudyPlanDateRange } from "./calendarRange";

describe("getStudyPlanDateRange", () => {
  it("includes today through the next 14 days", () => {
    const { start, end } = getStudyPlanDateRange(
      new Date("2026-09-20T15:30:00-05:00")
    );

    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(end.getDate()).toBe(4);
    expect(end.getHours()).toBe(23);
    expect(end.getMinutes()).toBe(59);
    expect(end.getSeconds()).toBe(59);
  });
});
