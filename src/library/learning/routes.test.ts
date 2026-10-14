import { describe, expect, it } from "vitest";
import { LEARNING_ROUTES, resolveLearningEntryRoute } from "./routes";

describe("Learning routes", () => {
  it("exposes one stable URL per surface", () => {
    expect(LEARNING_ROUTES).toEqual({
      home: "/learning",
      classes: "/learning/classes",
      "study-plan": "/learning/study-plan",
    });
  });

  it.each(["taskId=task-7", "suggestionId=suggestion-3"])(
    "moves legacy deep links into Study Plan without losing %s",
    (query) => {
      expect(resolveLearningEntryRoute("/learning", new URLSearchParams(query))).toBe(
        `/learning/study-plan?${query}`,
      );
    },
  );

  it("leaves the plain Learning landing route unchanged", () => {
    expect(resolveLearningEntryRoute("/learning", new URLSearchParams())).toBe("/learning");
  });
});
