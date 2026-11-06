// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { StudyTask } from "@/src/library/studyPlan/types";
import ListView from "./ListView";

afterEach(cleanup);

function task(id: string, title: string, estimatedMinutes: number): StudyTask & { id: string } {
  return {
    id,
    title,
    estimatedMinutes,
    status: "recommended",
    activityType: "quiz",
    courseName: "Database",
    courseCode: "CSC 330",
    reason: "Not reviewed recently",
    source: "recommended",
    rescheduleCount: 0,
  } as StudyTask & { id: string };
}

describe("ListView", () => {
  it("places every task duration in one fixed grid column", () => {
    const { container } = render(
      <ListView
        tasks={[
          task("short", "Quiz: Joins", 15),
          task("long", "Quiz: Recursive Programming Model Selection", 20),
        ]}
        onStart={() => undefined}
        onContinue={() => undefined}
        onSkip={() => undefined}
        onReschedule={() => undefined}
        onDelete={() => undefined}
        onPause={() => undefined}
        onComplete={() => undefined}
        onAddTask={() => undefined}
      />,
    );

    for (const row of [...container.querySelectorAll("li")]) {
      expect(row.className).toContain("grid-cols-[auto_minmax(0,1fr)_4rem_auto]");
    }
    expect(screen.getByText("15 min").className).toContain("justify-self-end");
    expect(screen.getByText("20 min").className).toContain("justify-self-end");
  });
});
