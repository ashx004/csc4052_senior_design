import { describe, expect, it } from "vitest";
import { resolveActivityTarget } from "./activityTarget";
import { getActivityUrlFromTarget } from "./sessionTimer";

describe("resolveActivityTarget", () => {
  it("keeps a new missed-question target intact", () => {
    const activityTarget = {
      kind: "quiz" as const,
      quizId: "quiz-1",
      sourceDocKey: "users/u/resources/sql.pdf",
      mode: "missed_questions" as const,
      questionIds: ["q2", "q5"],
    };
    expect(resolveActivityTarget({ activityType: "quiz", targetId: "quiz-1", activityTarget }))
      .toEqual(activityTarget);
  });

  it("adapts a legacy quiz targetId", () => {
    expect(resolveActivityTarget({ activityType: "quiz", targetId: "quiz-1" }))
      .toEqual({ kind: "quiz", quizId: "quiz-1", sourceDocKey: null, mode: "full" });
  });

  it("adapts a legacy flashcard targetId", () => {
    expect(resolveActivityTarget({ activityType: "flashcards", targetId: "set-1" }))
      .toEqual({ kind: "flashcard_set", setId: "set-1", sourceDocKey: null });
  });
});

describe("getActivityUrlFromTarget", () => {
  it("routes missed-question practice by taskId without question IDs in the URL", () => {
    expect(getActivityUrlFromTarget("course-1", {
      kind: "quiz",
      quizId: "quiz-1",
      sourceDocKey: null,
      mode: "missed_questions",
      questionIds: ["q2"],
    }, "task-1")).toBe("/courses/course-1/quizzes/quiz-1?mode=practice&taskId=task-1");
  });
});
