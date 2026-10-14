import { describe, expect, it } from "vitest";
import { selectTodaysPick } from "./todaysPick";

const resume = {
  title: "Grammar and parsing, part 2",
  context: "Programming Languages",
  href: "/courses/c1/learning?taskId=t1",
  remainingMinutes: 15,
};

const task = {
  title: "Quiz",
  courseName: "CSC 350",
  href: "/x",
};

describe("selectTodaysPick", () => {
  it("prefers the resume target over the next task", () => {
    const pick = selectTodaysPick({
      resumeTarget: resume,
      nextTask: { title: "Something else", courseName: "CSC 350", href: "/x" },
    });
    expect(pick).toEqual({
      kind: "resume",
      title: "Grammar and parsing, part 2",
      context: "Programming Languages",
      href: "/courses/c1/learning?taskId=t1",
      remainingMinutes: 15,
    });
  });

  it("falls back to the next task when there is no resume target", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: {
        title: "Read: type systems",
        courseName: "Programming Languages",
        href: "/courses/c1/learning?taskId=t9",
        estimatedMinutes: 20,
        subtaskCount: 3,
        percentComplete: 40,
      },
    });
    expect(pick).toEqual({
      kind: "recommended",
      title: "Read: type systems",
      context: "Programming Languages",
      href: "/courses/c1/learning?taskId=t9",
      lessonCount: 3,
      remainingMinutes: 20,
      percent: 40,
    });
  });

  it("returns null when neither source has anything", () => {
    expect(selectTodaysPick({ resumeTarget: null, nextTask: null })).toBeNull();
  });

  it("omits a zero or missing duration instead of reporting 0 min", () => {
    const pick = selectTodaysPick({
      resumeTarget: { ...resume, remainingMinutes: 0 },
      nextTask: null,
    });
    expect(pick).toStrictEqual({
      kind: "resume",
      title: "Grammar and parsing, part 2",
      context: "Programming Languages",
      href: "/courses/c1/learning?taskId=t1",
    });
  });

  it("omits an out-of-range percentage instead of reporting it", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, percentComplete: Number.NaN },
    });
    expect(pick).toStrictEqual({
      kind: "recommended",
      title: "Quiz",
      context: "CSC 350",
      href: "/x",
    });
  });

  it("keeps 0% as a real value for a student who has not started", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, percentComplete: 0 },
    });
    expect(pick?.percent).toBe(0);
  });

  it("keeps 100% as a real value", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, percentComplete: 100 },
    });
    expect(pick?.percent).toBe(100);
  });

  it("drops a percentage above 100", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, percentComplete: 101 },
    });
    expect(pick).toStrictEqual({
      kind: "recommended",
      title: "Quiz",
      context: "CSC 350",
      href: "/x",
    });
  });

  it("drops a negative percentage", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, percentComplete: -1 },
    });
    expect(pick).toStrictEqual({
      kind: "recommended",
      title: "Quiz",
      context: "CSC 350",
      href: "/x",
    });
  });

  it("omits remainingMinutes entirely when the resume target has no such key", () => {
    const pick = selectTodaysPick({
      resumeTarget: {
        title: "Grammar and parsing, part 2",
        context: "Programming Languages",
        href: "/courses/c1/learning?taskId=t1",
      },
      nextTask: null,
    });
    expect(pick).toStrictEqual({
      kind: "resume",
      title: "Grammar and parsing, part 2",
      context: "Programming Languages",
      href: "/courses/c1/learning?taskId=t1",
    });
  });

  it("drops a duration that rounds down to zero minutes", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, estimatedMinutes: 0.4 },
    });
    expect(pick).toStrictEqual({
      kind: "recommended",
      title: "Quiz",
      context: "CSC 350",
      href: "/x",
    });
  });

  it("drops a lesson count of zero", () => {
    const pick = selectTodaysPick({
      resumeTarget: null,
      nextTask: { ...task, subtaskCount: 0 },
    });
    expect(pick).toStrictEqual({
      kind: "recommended",
      title: "Quiz",
      context: "CSC 350",
      href: "/x",
    });
  });
});
