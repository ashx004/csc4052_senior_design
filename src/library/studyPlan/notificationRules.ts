import type { NotificationType, NotificationPreferences } from "./types";

const THROTTLE_WINDOW_MS = 4 * 60 * 60 * 1000;

const PREF_MAP: Record<NotificationType, keyof NotificationPreferences> = {
  session_reminder: "studyReminders",
  carryover: "studyReminders",
  break_suggestion: "breakSuggestions",
  pause_reminder: "studyReminders",
  task_completed: "progressUpdates",
  plan_completed: "progressUpdates",
  streak_milestone: "progressUpdates",
  weekly_summary: "progressUpdates",
  session_expired: "studyReminders",
  incomplete_plan: "studyReminders",
  no_visit_recovery: "studyReminders",
  deadline_warning: "deadlineWarnings",
};

export function isNotificationAllowed(
  type: NotificationType,
  prefs: NotificationPreferences
): boolean {
  return prefs[PREF_MAP[type]];
}

export function buildDedupeKey(
  type: NotificationType,
  date: string,
  contextId?: string
): string {
  return contextId ? `${type}:${date}:${contextId}` : `${type}:${date}`;
}

export interface NotificationContext {
  completedCount?: number;
  taskTitle?: string;
  courseName?: string;
  streakDays?: number;
  examName?: string;
  daysUntil?: number;
}

export function getNotificationContent(
  type: NotificationType,
  ctx: NotificationContext
): { title: string; body: string; actionLabel?: string } {
  switch (type) {
    case "plan_completed":
      return {
        title: "Great work today!",
        body: `You completed ${ctx.completedCount ?? 0} task${(ctx.completedCount ?? 0) === 1 ? "" : "s"}. Keep it up!`,
      };
    case "task_completed":
      return {
        title: "Task complete!",
        body: `Nice work on ${ctx.taskTitle ?? "your task"}. Ready for the next one?`,
        actionLabel: "Continue studying",
      };
    case "break_suggestion":
      return {
        title: "Time for a break?",
        body: "You've been studying for a while. A short break can help you focus better.",
      };
    case "pause_reminder":
      return {
        title: "Still studying?",
        body: "Your session is paused. Ready to get back on track?",
        actionLabel: "Resume studying",
      };
    case "session_reminder":
      return {
        title: "Your plan is waiting",
        body: "You have tasks ready to go. Start whenever you're ready.",
        actionLabel: "Open study plan",
      };
    case "carryover":
      return {
        title: "Tasks from yesterday",
        body: "You have unfinished tasks. Continue where you left off or start fresh.",
        actionLabel: "View tasks",
      };
    case "streak_milestone":
      return {
        title: `${ctx.streakDays}-day streak!`,
        body: "You're building a great study habit. Keep it up!",
      };
    case "weekly_summary":
      return {
        title: "Your week in review",
        body: "Check out what you accomplished this week.",
        actionLabel: "View summary",
      };
    case "session_expired":
      return {
        title: "Session timed out",
        body: "Your progress is saved. Resume when you're ready.",
        actionLabel: "Resume studying",
      };
    case "incomplete_plan":
      return {
        title: "Pick up where you left off",
        body: "You have unfinished tasks from your last study session.",
        actionLabel: "Continue studying",
      };
    case "no_visit_recovery":
      return {
        title: "Ready to study?",
        body: "It's been a few days. Your courses are waiting whenever you're ready.",
        actionLabel: "Open study plan",
      };
    case "deadline_warning":
      return {
        title: `${ctx.examName ?? "Exam"} coming up`,
        body: ctx.daysUntil === 0
          ? "Good luck on your exam today!"
          : `${ctx.daysUntil} day${ctx.daysUntil === 1 ? "" : "s"} until your exam. This topic needs more practice.`,
        actionLabel: "Start studying",
      };
  }
}

export function shouldThrottle(
  type: NotificationType,
  recentNotifications: {
    type: NotificationType;
    createdAt: { toMillis(): number };
  }[],
  now: number
): boolean {
  return recentNotifications.some(
    (n) =>
      n.type === type &&
      now - n.createdAt.toMillis() < THROTTLE_WINDOW_MS
  );
}
