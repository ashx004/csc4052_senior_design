import {
  DEFAULT_EMAIL_REMINDER_OFFSETS_MINUTES,
  normalizeReminderOffsets,
} from "./reminderPreferences";

export const DEFAULT_ALL_DAY_DUE_HOUR = 17;

export type ReminderEligibleEvent = {
  id: string;
  title: string;
  kind?: "event" | "study" | "assignment" | "exam" | "class";
  classId?: string;
  className?: string;
  startTime: string;
  allDay: boolean;
  dueAt?: string;
  emailReminderOffsets?: number[];
};

export type PendingEmailReminder = {
  jobId: string;
  idempotencyKey: string;
  offsetMinutes: number;
  dueAt: Date;
  triggerAt: Date;
};

export function isEmailReminderEligible(event: Pick<ReminderEligibleEvent, "kind">): boolean {
  return event.kind === "assignment" || event.kind === "exam";
}

/**
 * Timed assignments use their start time as the due time. All-day assignments
 * have no clock value, so the browser records a temporary 5 PM local deadline
 * until the calendar editor gains a dedicated due-time field.
 */
export function resolveEventDueAt(event: Omit<ReminderEligibleEvent, "id" | "title">): string | null {
  if (!isEmailReminderEligible(event)) return null;

  if (event.dueAt) {
    const explicitDueAt = new Date(event.dueAt);
    return Number.isNaN(explicitDueAt.getTime()) ? null : explicitDueAt.toISOString();
  }

  if (!event.allDay) {
    const startTime = new Date(event.startTime);
    return Number.isNaN(startTime.getTime()) ? null : startTime.toISOString();
  }

  const [year, month, day] = event.startTime.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, DEFAULT_ALL_DAY_DUE_HOUR, 0, 0, 0).toISOString();
}

export function buildPendingEmailReminders(event: ReminderEligibleEvent): PendingEmailReminder[] {
  if (!isEmailReminderEligible(event)) return [];

  const dueAtValue = resolveEventDueAt(event);
  if (!dueAtValue) return [];

  const dueAt = new Date(dueAtValue);
  const dueAtMilliseconds = dueAt.getTime();
  const now = Date.now();
  if (dueAtMilliseconds <= now) return [];

  const offsets = event.emailReminderOffsets?.length
    ? event.emailReminderOffsets
    : DEFAULT_EMAIL_REMINDER_OFFSETS_MINUTES;

  return normalizeReminderOffsets(offsets).flatMap((offsetMinutes) => {
    const triggerAt = new Date(dueAtMilliseconds - offsetMinutes * 60_000);
    // A late-created event should not immediately receive a stale "one day
    // before" message. Only send at an offset that is still in the future.
    if (triggerAt.getTime() <= now) return [];

    const jobId = `${event.id}__${dueAtMilliseconds}__${offsetMinutes}`;
    return [{
      jobId,
      idempotencyKey: `calendar-reminder/${event.id}/${dueAtMilliseconds}/${offsetMinutes}`,
      offsetMinutes,
      dueAt,
      triggerAt,
    }];
  });
}
