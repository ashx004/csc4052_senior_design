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

function formatTime(value: string): string {
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return value;
  return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" })
    .format(new Date(2000, 0, 1, hours, minutes));
}
