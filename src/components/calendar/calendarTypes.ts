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
  cream: "bg-[#f3dfc0] text-[#7a5626] dark:bg-[#4a3a1f] dark:text-[#f0d9ae]",
  sage: "bg-[#eef0d8] text-[#6a6f33] dark:bg-[#3a3d1f] dark:text-[#dde2b0]",
  rose: "bg-[#ead7dc] text-[#87485a] dark:bg-[#3d2530] dark:text-[#e8b9c7]",
  lavender: "bg-[#eee3f2] text-[#735384] dark:bg-[#332740] dark:text-[#d9bfe8]",
  brown: "bg-[#d8b99a] text-[#5f4026] dark:bg-[#3d2c1c] dark:text-[#e8c9a8]",
  blue: "bg-[#4256d6] text-white dark:bg-[#33449e] dark:text-white",
};
