export type CalendarView = "month" | "week" | "day";

export type EventTone =
  | "cream"
  | "sage"
  | "rose"
  | "lavender"
  | "brown"
  | "blue";

export type CalendarEvent = {
  title: string;
  time?: string;
  tone: EventTone;
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