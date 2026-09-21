import type { EligibleTopic, StudyTask } from "./types";

export function filterTopicsAlreadyInPlan(
  topics: EligibleTopic[],
  tasks: Pick<StudyTask, "courseId" | "topicLabel">[]
): EligibleTopic[] {
  const existingTopics = new Set(
    tasks.map((task) => `${task.courseId}:${task.topicLabel}`)
  );

  return topics.filter(
    (topic) => !existingTopics.has(`${topic.courseId}:${topic.topicLabel}`)
  );
}

export function appendPlanTaskIds(
  existingTaskIds: string[],
  newTaskIds: string[]
): string[] {
  return [...existingTaskIds, ...newTaskIds];
}
