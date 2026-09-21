import { describe, expect, it } from "vitest";
import { getPlanAggregateUpdates, hasUsablePlan } from "./planState";

describe("hasUsablePlan", () => {
  it("treats a completed plan with zero tasks as unusable", () => {
    expect(
      hasUsablePlan({ state: "completed", totalTasks: 0, taskIds: [] })
    ).toBe(false);
  });

  it("treats an active plan with tasks as usable", () => {
    expect(
      hasUsablePlan({ state: "active", totalTasks: 2, taskIds: ["task-1", "task-2"] })
    ).toBe(true);
  });

  it("falls back to taskIds for older plans without totalTasks", () => {
    expect(hasUsablePlan({ state: "active", taskIds: ["task-1"] })).toBe(true);
  });
});

describe("getPlanAggregateUpdates", () => {
  it("marks a plan completed when its last task is completed", () => {
    expect(
      getPlanAggregateUpdates(
        { taskIds: ["task-1", "task-2"], state: "active" },
        [
          { id: "task-1", status: "completed", totalActiveMinutes: 12 },
          { id: "task-2", status: "recommended", totalActiveMinutes: 0 },
        ],
        "task-2",
        "completed"
      )
    ).toEqual({
      state: "completed",
      completedCount: 2,
      skippedCount: 0,
      totalActiveMinutes: 12,
    });
  });

  it("counts skipped tasks and keeps a plan active while work remains", () => {
    expect(
      getPlanAggregateUpdates(
        { taskIds: ["task-1", "task-2"], state: "active" },
        [
          { id: "task-1", status: "recommended", totalActiveMinutes: 0 },
          { id: "task-2", status: "recommended", totalActiveMinutes: 4 },
        ],
        "task-1",
        "skipped"
      )
    ).toEqual({
      state: "active",
      completedCount: 0,
      skippedCount: 1,
      totalActiveMinutes: 4,
    });
  });
});
