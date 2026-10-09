import { isWeakTopic, needsDocumentSelection } from "./recommendationEngine";
import type { EligibleTopic, GeneratedTask, SetupConfig, StudyTask } from "./types";

export const DEFAULT_AUTO_PLAN_CONFIG: SetupConfig = {
  availableMinutes: 60,
  goal: "general",
  courseId: null,
  activityPreference: "auto",
};

function dateString(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

/** Monday of the week containing `date` (local time). Sunday belongs to the week before. */
export function startOfWeekDateString(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const daysSinceMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - daysSinceMonday);
  return dateString(monday);
}

export function remainingMinutesAfterCarryover(
  totalMinutes: number,
  carried: readonly Pick<StudyTask, "estimatedMinutes">[],
): number {
  const used = carried.reduce((sum, task) => sum + task.estimatedMinutes, 0);
  return Math.max(0, totalMinutes - used);
}

/** Weak courses (some topic below the mastery threshold) with no study task yet this week. */
export function weakCoursesNeedingTask(
  topics: readonly EligibleTopic[],
  tasksThisWeek: readonly Pick<StudyTask, "courseId">[],
): string[] {
  const touched = new Set(tasksThisWeek.map((task) => task.courseId));
  const result: string[] = [];
  for (const topic of topics) {
    if (touched.has(topic.courseId) || result.includes(topic.courseId)) continue;
    if (isWeakTopic(topic)) result.push(topic.courseId);
  }
  return result;
}

export function shouldAutoPlan(input: {
  hasUser: boolean;
  dataReady: boolean;
  hasUsablePlan: boolean;
  alreadyAttempted: boolean;
}): boolean {
  return input.hasUser && input.dataReady && !input.hasUsablePlan && !input.alreadyAttempted;
}

interface DocumentResource {
  id: string;
  name: string;
  sourceDocKey: string;
}

/** Reading tasks without a document get their course's first resource; ones with no resource are dropped. */
export function attachFirstDocument(
  tasks: readonly GeneratedTask[],
  resourcesByCourse: ReadonlyMap<string, readonly DocumentResource[]>,
): GeneratedTask[] {
  const out: GeneratedTask[] = [];
  for (const task of tasks) {
    if (!needsDocumentSelection(task)) {
      out.push(task);
      continue;
    }
    const resource = resourcesByCourse.get(task.courseId)?.[0];
    if (!resource) continue;
    out.push({
      ...task,
      targetId: resource.id,
      activityTarget: { kind: "document", resourceId: resource.id, sourceDocKey: resource.sourceDocKey },
    });
  }
  return out;
}
