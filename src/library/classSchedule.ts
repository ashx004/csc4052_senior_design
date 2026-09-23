export const CLASS_MEETING_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export type ClassMeetingDay = (typeof CLASS_MEETING_DAYS)[number];

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
};
