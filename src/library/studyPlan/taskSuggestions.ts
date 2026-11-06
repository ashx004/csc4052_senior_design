import type { EligibleTopic, StudyTask } from "./types";

export function filterTopicsAlreadyInPlan(
  topics: EligibleTopic[],
  tasks: Pick<StudyTask, "courseId" | "topicLabel" | "activityType">[]
): EligibleTopic[] {
  const existingTopics = new Set(
    tasks.map((task) => `${task.courseId}:${task.topicLabel}:${task.activityType}`)
  );

  return topics.filter(
    (topic) => !existingTopics.has(`${topic.courseId}:${topic.topicLabel}:${topic.activityType}`)
  );
}

export function appendPlanTaskIds(
  existingTaskIds: string[],
  newTaskIds: string[]
): string[] {
  return [...existingTaskIds, ...newTaskIds];
}
