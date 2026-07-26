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

export const eventToneClasses: Record<EventTone, string> = {
  cream: "bg-[#f3dfc0] text-[#7a5626]",
  sage: "bg-[#eef0d8] text-[#6a6f33]",
  rose: "bg-[#ead7dc] text-[#87485a]",
  lavender: "bg-[#eee3f2] text-[#735384]",
  brown: "bg-[#d8b99a] text-[#5f4026]",
  blue: "bg-[#4256d6] text-white",
};
