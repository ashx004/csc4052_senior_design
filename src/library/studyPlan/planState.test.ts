import { describe, expect, it } from "vitest";
import { hasUsablePlan } from "./planState";

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
