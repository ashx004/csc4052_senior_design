export type CalendarView = "month" | "week" | "day";

export type EventTone =
  | "cream"
  | "sage"
  | "rose"
  | "lavender"
  | "brown"
  | "blue";

export type CalendarConnectionStatus = "connected" | "disconnected" | "loading";

export type CalendarEvent = {
  id: string;
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  timeZone?: string;
  status?: "confirmed" | "tentative" | "cancelled";
  htmlLink?: string;
  tone?: EventTone;
  source: "google" | "local";
};

export type CalendarDay = {
  day: number;
  muted?: boolean;
  selected?: boolean;
  events?: CalendarEvent[];
};

export type WeekDay = {
  label: string;
  day: number;
  selected?: boolean;
};
