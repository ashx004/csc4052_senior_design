import type { ActivityTarget, ActivityType } from "./types";

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

function appendTaskId(url: string, taskId?: string): string {
  if (!taskId) return url;
  return `${url}&taskId=${taskId}`;
}

export function getActivityUrlFromTarget(
  courseId: string,
  target: ActivityTarget,
  taskId?: string
): string {
  switch (target.kind) {
    case "document":
      return appendTaskId(`/courses/${courseId}?resourceId=${target.resourceId}`, taskId);
    case "quiz": {
      const mode = target.mode === "missed_questions" ? "practice" : "take";
      return appendTaskId(
        `/courses/${courseId}/quizzes/${target.quizId}?mode=${mode}`,
        taskId
      );
    }
    case "flashcard_set":
      return appendTaskId(`/courses/${courseId}/flashcards?setId=${target.setId}`, taskId);
  }
}

export function formatElapsedTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
