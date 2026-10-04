import { describe, expect, it } from "vitest";
import { buildCarryoverUpdate } from "./carryover";

describe("buildCarryoverUpdate", () => {
  it("moves the task to today so today's task list loads it", () => {
    const update = buildCarryoverUpdate({ status: "in_progress", rescheduleCount: 0 }, "2026-10-05");
    expect(update.scheduledDate).toBe("2026-10-05");
    expect(update.planDate).toBe("2026-10-05");
    expect(update.status).toBe("recommended");
  });

  it("counts the move as a reschedule", () => {
    expect(buildCarryoverUpdate({ status: "recommended", rescheduleCount: 2 }, "2026-10-05").rescheduleCount).toBe(3);
  });

  it("records where the task came from", () => {
    expect(buildCarryoverUpdate({ status: "in_progress", rescheduleCount: 0 }, "2026-10-05").change).toEqual({
      from: "in_progress",
      to: "recommended",
      reason: "Carried over",
    });
  });

  it("clears yesterday's block times so the task is re-packed for today", () => {
    const update = buildCarryoverUpdate({ status: "recommended", rescheduleCount: 0 }, "2026-10-05");
    expect(update.scheduledStart).toBeNull();
    expect(update.scheduledEnd).toBeNull();
    expect(update.scheduleRemoved).toBe(false);
  });
});
