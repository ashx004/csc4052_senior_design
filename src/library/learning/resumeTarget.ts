import { resolveTaskActivityUrl } from "@/src/library/studyPlan/sessionTimer";
import type { ActivityTarget, ActivityType } from "@/src/library/studyPlan/types";

export type LearningResumeTarget = {
  title: string;
  context: string;
  href: string;
  remainingMinutes?: number;
};

export type ResumeTaskInput = {
  id: string;
  title: string;
  courseName: string;
  courseId: string;
  targetId: string | null;
  activityType: ActivityType;
  activityTarget?: ActivityTarget;
  estimatedMinutes: number;
  totalActiveMinutes?: number;
};

export type ResumeClassInput = {
  id: string;
  name: string;
  studiedAtMillis: number;
};

export function selectLearningResumeTarget(input: {
  nextTask: ResumeTaskInput | null;
  recentClass: ResumeClassInput | null;
}): LearningResumeTarget | null {
  const { nextTask, recentClass } = input;

  if (nextTask) {
    const href = resolveTaskActivityUrl(nextTask, nextTask.id);
    if (href) {
      return {
        title: nextTask.title,
        context: nextTask.courseName,
        href,
        remainingMinutes: Math.max(
          0,
          nextTask.estimatedMinutes - (nextTask.totalActiveMinutes ?? 0),
        ),
      };
    }
  }

  if (recentClass) {
    return {
      title: `Continue ${recentClass.name}`,
      context: "Recent class activity",
      href: `/courses/${recentClass.id}/learning`,
    };
  }

  return null;
}
