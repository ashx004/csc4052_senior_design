export const CLASS_MEETING_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type ClassMeetingDay = (typeof CLASS_MEETING_DAYS)[number];

// A dated change to an otherwise recurring class meeting. Keeping exceptions
// on the enrollment lets the calendar stay derived from one source of truth.
export type ClassMeetingException = {
  date: string;
  cancelled?: boolean;
  startTime?: string;
  endTime?: string;
  room?: string;
};

export type StructuredClassSchedule = {
  // Stored as stable day identifiers and 24-hour local wall-clock values so
  // calendar sync never has to parse a phrase such as "MWF at ten".
  meetingDays?: ClassMeetingDay[];
  meetingStartTime?: string;
  meetingEndTime?: string;
  meetingTimeZone?: string;
  // These are ISO calendar dates (YYYY-MM-DD), not instants. They define
  // the term boundary for derived recurring class meetings.
  termStartDate?: string;
  termEndDate?: string;
  // Browser reminders are best-effort while Calendar is open. A future push
  // notification service can use this persisted preference as well.
  meetingReminderMinutes?: number;
  meetingExceptions?: ClassMeetingException[];
};

const DAY_LABELS: Record<ClassMeetingDay, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export function formatClassMeetingSchedule(schedule: StructuredClassSchedule): string | null {
  if (!schedule.meetingDays?.length || !schedule.meetingStartTime || !schedule.meetingEndTime) return null;
  const days = schedule.meetingDays.map((day) => DAY_LABELS[day]).join(" / ");
  return `${days} ${formatTime(schedule.meetingStartTime)}–${formatTime(schedule.meetingEndTime)}`;
}

const DAYS_BY_JS_INDEX: ClassMeetingDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function isClassMeetingOnDate(schedule: StructuredClassSchedule, date: Date): boolean {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return Boolean(schedule.meetingDays?.includes(DAYS_BY_JS_INDEX[date.getDay()]) &&
    (!schedule.termStartDate || key >= schedule.termStartDate) &&
    (!schedule.termEndDate || key <= schedule.termEndDate));
}

export function getClassMeetingException(schedule: StructuredClassSchedule, date: Date): ClassMeetingException | undefined {
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return schedule.meetingExceptions?.find((exception) => exception.date === key);
}

export function zonedClassDateTime(date: Date, time: string, timeZone: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const desired = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const toUtc = (value: Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(value).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  };
  let instant = new Date(desired + (desired - toUtc(new Date(desired))));
  instant = new Date(instant.getTime() + (desired - toUtc(instant)));
  return instant;
}

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hours, minutes));
}
