import type { EligibleTopic } from "./types";

export interface DocumentTopicResource {
  id: string;
  name: string;
  sourceDocKey: string;
}

export interface DocumentTopicsInput {
  course: { id: string; className: string; classCode: string };
  resources: readonly DocumentTopicResource[];
  /** Ids of resources an existing set already stands for; they are not offered a second time. */
  representedResourceIds: ReadonlySet<string>;
  /** True when the course already has a set-backed topic. */
  hasSetTopic: boolean;
  lastStudiedAtFor: (sourceDocKey: string) => EligibleTopic["lastStudiedAt"];
}

/**
 * Reading topics for one course. Every course contributes its documents, whether or not it
 * also has sets; only a document already behind a set is left out.
 */
export function documentTopicsForCourse(input: DocumentTopicsInput): EligibleTopic[] {
  const { course, resources, representedResourceIds, hasSetTopic, lastStudiedAtFor } = input;
  const base = { courseId: course.id, courseName: course.className, courseCode: course.classCode };
  if (resources.length > 0) {
    return resources
      .filter((resource) => !representedResourceIds.has(resource.id))
      .map((resource) => ({
        ...base,
        topicLabel: resource.name,
        targetId: null,
        activityType: "reading" as const,
        activityTarget: {
          kind: "document" as const,
          resourceId: resource.id,
          sourceDocKey: resource.sourceDocKey,
        },
        quizMastery: null,
        flashcardEngagement: null,
        lastStudiedAt: lastStudiedAtFor(resource.sourceDocKey),
        skipCount: 0,
      }));
  }
  // A course with sets but no documents already has something to offer.
  if (hasSetTopic) return [];
  return [
    {
      ...base,
      topicLabel: "Course exploration",
      targetId: null,
      activityType: "reading" as const,
      quizMastery: null,
      flashcardEngagement: null,
      lastStudiedAt: null,
      skipCount: 0,
    },
  ];
}
