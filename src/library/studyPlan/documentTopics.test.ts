import { describe, expect, it } from "vitest";
import { documentTopicsForCourse } from "./documentTopics";

const course = { id: "c1", className: "Algorithms", classCode: "CSC4052" };
const resources = [
  { id: "r1", name: "Lecture 1", sourceDocKey: "k1" },
  { id: "r2", name: "Lecture 2", sourceDocKey: "k2" },
  { id: "r3", name: "Lecture 3", sourceDocKey: "k3" },
];
const run = (over: Partial<Parameters<typeof documentTopicsForCourse>[0]> = {}) =>
  documentTopicsForCourse({
    course,
    resources,
    representedResourceIds: new Set(),
    hasSetTopic: false,
    lastStudiedAtFor: () => null,
    ...over,
  });

describe("documentTopicsForCourse", () => {
  it("still offers every document when the course already has a set", () => {
    const topics = run({ hasSetTopic: true });
    expect(topics.map((t) => t.topicLabel)).toEqual(["Lecture 1", "Lecture 2", "Lecture 3"]);
  });

  it("leaves out only documents an existing set already stands for", () => {
    const topics = run({ hasSetTopic: true, representedResourceIds: new Set(["r2"]) });
    expect(topics.map((t) => t.topicLabel)).toEqual(["Lecture 1", "Lecture 3"]);
  });

  it("keeps document topics as exploration reading topics", () => {
    const [topic] = run();
    expect(topic).toMatchObject({
      targetId: null,
      activityType: "reading",
      quizMastery: null,
      flashcardEngagement: null,
      skipCount: 0,
      activityTarget: { kind: "document", resourceId: "r1", sourceDocKey: "k1" },
    });
  });

  it("falls back to course exploration only for a course with no documents and no sets", () => {
    expect(run({ resources: [] }).map((t) => t.topicLabel)).toEqual(["Course exploration"]);
    expect(run({ resources: [], hasSetTopic: true })).toEqual([]);
  });
});
