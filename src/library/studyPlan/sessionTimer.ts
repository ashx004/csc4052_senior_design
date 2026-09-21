import type { ActivityType } from "./types";

export function calculateActiveMinutes(
  periods: {
    startedAt: { toMillis(): number };
    endedAt: { toMillis(): number } | null;
  }[]
): number {
  let totalMs = 0;
  for (const period of periods) {
    if (period.endedAt) {
      totalMs += period.endedAt.toMillis() - period.startedAt.toMillis();
    }
  }
  return Math.floor(totalMs / 60000);
}

export function getActivityUrl(
  activityType: ActivityType,
  courseId: string,
  targetId: string | null
): string {
  switch (activityType) {
    case "quiz":
      if (!targetId) return `/courses/${courseId}/learning`;
      return `/courses/${courseId}/quizzes/${targetId}?mode=take`;
    case "flashcards":
      if (!targetId) return `/courses/${courseId}/learning`;
      return `/courses/${courseId}/flashcards?setId=${targetId}`;
    case "reading":
      return `/courses/${courseId}/learning`;
    case "ai_explanation":
      return "/ai-assistant";
  }
}

export function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
