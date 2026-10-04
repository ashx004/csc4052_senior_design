import { describe, expect, it } from "vitest";
import { choosePlanStarter, planStarterHref } from "./planStarter";

describe("choosePlanStarter", () => {
  it("asks to enroll when there are no classes", () => {
    expect(choosePlanStarter({ classIds: [], newestDocument: null })).toEqual({ kind: "enroll" });
  });
  it("asks to upload when classes have no documents", () => {
    expect(choosePlanStarter({ classIds: ["c1", "c2"], newestDocument: null })).toEqual({ kind: "upload", courseId: "c1" });
  });
  it("offers a quiz on the newest document", () => {
    expect(
      choosePlanStarter({
        classIds: ["c1"],
        newestDocument: { courseId: "c2", resourceId: "r9", name: "Week 3.pdf" },
      }),
    ).toEqual({ kind: "quiz", courseId: "c2", resourceId: "r9", documentName: "Week 3.pdf" });
  });
});

describe("planStarterHref", () => {
  it("links each choice to the right page", () => {
    expect(planStarterHref({ kind: "enroll" })).toBe("/classes");
    expect(planStarterHref({ kind: "upload", courseId: "c1" })).toBe("/courses/c1");
    expect(planStarterHref({ kind: "quiz", courseId: "c1", resourceId: "r 1", documentName: "x" })).toBe(
      "/courses/c1/learning?quizFrom=r%201",
    );
  });
});
