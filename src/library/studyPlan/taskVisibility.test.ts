import { describe, expect, it } from "vitest";
import { getVisibleStudyTasks } from "./taskVisibility";
import type { StudyTask } from "./types";

const task = (status: StudyTask["status"], id: string): StudyTask & { id: string } =>
  ({ id, status } as StudyTask & { id: string });

describe("getVisibleStudyTasks", () => {
  it("hides skipped tasks while preserving active, completed, and rescheduled tasks", () => {
    const visible = getVisibleStudyTasks([
      task("recommended", "recommended"),
      task("in_progress", "in-progress"),
      task("completed", "completed"),
      task("skipped", "skipped"),
      task("rescheduled", "rescheduled"),
    ]);

    expect(visible.map((item) => item.id)).toEqual([
      "recommended",
      "in-progress",
      "completed",
      "rescheduled",
    ]);
  });
});
