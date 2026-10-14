import type { LearningResumeTarget } from "./resumeTarget";

export type TodaysPick = {
  kind: "resume" | "recommended";
  title: string;
  context: string;
  href: string;
  lessonCount?: number;
  remainingMinutes?: number;
  percent?: number;
};

export type PickTaskInput = {
  title: string;
  courseName: string;
  href: string;
  estimatedMinutes?: number;
  subtaskCount?: number;
  percentComplete?: number;
};

/**
 * A minute or lesson count is only worth showing when it is still positive
 * after rounding. Checking before rounding lets 0.4 through, which then prints
 * as "0 min".
 */
function usablePositiveInteger(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  const rounded = Math.round(value);
  return rounded > 0 ? rounded : undefined;
}

/** A percentage is only worth showing when it is a finite 0-100 value. */
function usablePercent(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  if (value < 0 || value > 100) return undefined;
  return Math.round(value);
}

/**
 * The single thing the landing page offers to start. An in-flight session wins,
 * because finishing something beats starting something; otherwise the plan's
 * next task is offered.
 */
export function selectTodaysPick(input: {
  resumeTarget: LearningResumeTarget | null;
  nextTask: PickTaskInput | null;
}): TodaysPick | null {
  const { resumeTarget, nextTask } = input;

  if (resumeTarget) {
    const pick: TodaysPick = {
      kind: "resume",
      title: resumeTarget.title,
      context: resumeTarget.context,
      href: resumeTarget.href,
    };
    const minutes = usablePositiveInteger(resumeTarget.remainingMinutes);
    if (minutes !== undefined) pick.remainingMinutes = minutes;
    return pick;
  }

  if (nextTask) {
    const pick: TodaysPick = {
      kind: "recommended",
      title: nextTask.title,
      context: nextTask.courseName,
      href: nextTask.href,
    };
    const lessons = usablePositiveInteger(nextTask.subtaskCount);
    if (lessons !== undefined) pick.lessonCount = lessons;
    const minutes = usablePositiveInteger(nextTask.estimatedMinutes);
    if (minutes !== undefined) pick.remainingMinutes = minutes;
    const percent = usablePercent(nextTask.percentComplete);
    if (percent !== undefined) pick.percent = percent;
    return pick;
  }

  return null;
}
