import { describe, expect, it } from "vitest";
import {
  dropStartFromOffset,
  dropStartFromPointer,
  moveBlock,
  roundUpToStep,
  scheduleUnscheduledTasks,
  weakSpotTasksDue,
} from "./studySchedule";

const at = (h: number, m: number) => new Date(2026, 9, 5, h, m, 0, 0);
const iso = (h: number, m: number) => at(h, m).toISOString();

describe("roundUpToStep", () => {
  it("rounds up to the next step", () => {
    expect(roundUpToStep(new Date(2026, 9, 5, 9, 2, 30), 5).getTime()).toBe(at(9, 5).getTime());
  });
  it("keeps a time already on a step", () => {
    expect(roundUpToStep(at(9, 10), 5).getTime()).toBe(at(9, 10).getTime());
  });
});

describe("scheduleUnscheduledTasks", () => {
  it("stacks 20-minute blocks with 5-minute breaks from now", () => {
    const updates = scheduleUnscheduledTasks(
      [
        { id: "a", status: "recommended" },
        { id: "b", status: "in_progress" },
      ],
      new Date(2026, 9, 5, 9, 2),
    );
    expect(updates).toEqual([
      { taskId: "a", scheduledStart: iso(9, 5), scheduledEnd: iso(9, 25) },
      { taskId: "b", scheduledStart: iso(9, 30), scheduledEnd: iso(9, 50) },
    ]);
  });

  it("starts after the last block that is already scheduled", () => {
    const updates = scheduleUnscheduledTasks(
      [
        { id: "a", status: "recommended", scheduledStart: iso(10, 0), scheduledEnd: iso(10, 20) },
        { id: "b", status: "recommended" },
      ],
      at(9, 0),
    );
    expect(updates).toEqual([{ taskId: "b", scheduledStart: iso(10, 25), scheduledEnd: iso(10, 45) }]);
  });

  it("skips finished tasks and tasks that already have a time", () => {
    expect(
      scheduleUnscheduledTasks(
        [
          { id: "done", status: "completed" },
          { id: "skip", status: "skipped" },
          { id: "has", status: "recommended", scheduledStart: iso(8, 0), scheduledEnd: iso(8, 20) },
        ],
        at(9, 0),
      ),
    ).toEqual([]);
  });

  it("ignores blocks of finished tasks when finding the start", () => {
    const updates = scheduleUnscheduledTasks(
      [
        { id: "old", status: "completed", scheduledStart: iso(11, 0), scheduledEnd: iso(11, 20) },
        { id: "new", status: "recommended" },
      ],
      at(9, 0),
    );
    expect(updates[0].scheduledStart).toBe(iso(9, 0));
  });
});

describe("moveBlock", () => {
  it("keeps the block length", () => {
    expect(moveBlock({ scheduledStart: iso(9, 0), scheduledEnd: iso(9, 30) }, at(14, 15))).toEqual({
      scheduledStart: iso(14, 15),
      scheduledEnd: iso(14, 45),
    });
  });
  it("falls back to 20 minutes for a broken block", () => {
    expect(moveBlock({ scheduledStart: iso(9, 0), scheduledEnd: iso(9, 0) }, at(14, 0)).scheduledEnd).toBe(iso(14, 20));
  });
});

describe("dropStartFromOffset", () => {
  const day = new Date(2026, 9, 5);
  it("snaps down to 15 minutes inside the hour", () => {
    expect(dropStartFromOffset(day, 14, 40, 64).getTime()).toBe(at(14, 30).getTime()); // 37.5 min -> 30
  });
  it("clamps to the top and bottom of the hour", () => {
    expect(dropStartFromOffset(day, 14, -10, 64).getTime()).toBe(at(14, 0).getTime());
    expect(dropStartFromOffset(day, 14, 999, 64).getTime()).toBe(at(14, 45).getTime());
  });
});

describe("dropStartFromPointer", () => {
  const day = new Date(2026, 9, 5);
  it("rolls an offset beyond the cell into the next hour", () => {
    expect(dropStartFromPointer(day, 8, 80, 64).getTime()).toBe(at(9, 15).getTime());
  });
  it("subtracts the grab offset", () => {
    expect(dropStartFromPointer(day, 14, 40, 64, 20).getTime()).toBe(at(14, 15).getTime());
  });
  it("treats a non-finite offset as the top of the hour", () => {
    expect(dropStartFromPointer(day, 14, NaN, 64).getTime()).toBe(at(14, 0).getTime());
  });
  it("rolls a negative offset back into the previous hour", () => {
    expect(dropStartFromPointer(day, 14, -20, 64).getTime()).toBe(at(13, 30).getTime());
  });
});

describe("scheduleUnscheduledTasks edge cases", () => {
  it("starts at rounded now when now is after the last block end", () => {
    const updates = scheduleUnscheduledTasks(
      [
        { id: "a", status: "recommended", scheduledStart: iso(8, 0), scheduledEnd: iso(8, 20) },
        { id: "b", status: "recommended" },
      ],
      new Date(2026, 9, 5, 9, 2),
    );
    expect(updates).toEqual([{ taskId: "b", scheduledStart: iso(9, 5), scheduledEnd: iso(9, 25) }]);
  });
  it("starts after a block that is running now", () => {
    const updates = scheduleUnscheduledTasks(
      [
        { id: "a", status: "recommended", scheduledStart: iso(9, 0), scheduledEnd: iso(9, 20) },
        { id: "b", status: "recommended" },
      ],
      new Date(2026, 9, 5, 9, 10),
    );
    expect(updates).toEqual([{ taskId: "b", scheduledStart: iso(9, 25), scheduledEnd: iso(9, 45) }]);
  });
  it("ignores a task with a start but no end", () => {
    const updates = scheduleUnscheduledTasks(
      [
        { id: "a", status: "recommended", scheduledStart: iso(11, 0) },
        { id: "b", status: "recommended" },
      ],
      new Date(2026, 9, 5, 9, 2),
    );
    expect(updates).toEqual([{ taskId: "b", scheduledStart: iso(9, 5), scheduledEnd: iso(9, 25) }]);
  });
});

describe("weakSpotTasksDue", () => {
  const now = at(10, 0);
  it("returns weak-spot tasks whose block has started", () => {
    expect(
      weakSpotTasksDue(
        [
          { id: "due", status: "recommended", scheduledStart: iso(9, 55), sourceSuggestionId: "s1" },
          { id: "later", status: "recommended", scheduledStart: iso(10, 30), sourceSuggestionId: "s2" },
          { id: "normal", status: "recommended", scheduledStart: iso(9, 0), sourceSuggestionId: null },
          { id: "made", status: "recommended", scheduledStart: iso(9, 0), sourceSuggestionId: "s3", generatedPracticeQuizId: "q" },
          { id: "started", status: "in_progress", scheduledStart: iso(9, 0), sourceSuggestionId: "s4" },
        ],
        now,
      ),
    ).toEqual(["due"]);
  });
});

describe("scheduleUnscheduledTasks removed tasks", () => {
  it("does not re-schedule a task the user removed from the schedule", () => {
    const now = new Date("2026-10-05T09:00:00");
    const updates = scheduleUnscheduledTasks(
      [
        { id: "gone", status: "recommended", scheduledStart: null, scheduledEnd: null, scheduleRemoved: true },
        { id: "new", status: "recommended" },
      ],
      now,
    );
    expect(updates.map((u) => u.taskId)).toEqual(["new"]);
  });
});
