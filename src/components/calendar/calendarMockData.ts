import type {
  CalendarDay,
  EventTone,
  WeekDay,
} from "@/src/components/calendar/calendarTypes";

export const monthWeekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const weekDays: WeekDay[] = [
  { label: "Mon", day: 7 },
  { label: "Tue", day: 8 },
  { label: "Wed", day: 9 },
  { label: "Thu", day: 10, selected: true },
  { label: "Fri", day: 11 },
  { label: "Sat", day: 12 },
  { label: "Sun", day: 13 },
];

export const timeSlots = Array.from({ length: 9 }, (_, index) =>
  `${String(index).padStart(2, "0")}:00`
);

export const eventToneClasses: Record<EventTone, string> = {
  cream: "bg-[#f3dfc0] text-[#7a5626]",
  sage: "bg-[#eef0d8] text-[#6a6f33]",
  rose: "bg-[#ead7dc] text-[#87485a]",
  lavender: "bg-[#eee3f2] text-[#735384]",
  brown: "bg-[#d8b99a] text-[#5f4026]",
  blue: "bg-[#4256d6] text-white",
};

export const monthDays: CalendarDay[] = [
  { day: 30, muted: true },
  { day: 31, muted: true },
  { day: 1 },
  { day: 2 },
  { day: 3, events: [{ title: "Design Review", tone: "cream" }] },
  { day: 4 },
  { day: 5 },

  { day: 6 },
  {
    day: 7,
    events: [{ title: "Meeting", time: "11:30 - 13:00", tone: "sage" }],
  },
  { day: 8 },
  { day: 9 },
  {
    day: 10,
    selected: true,
    events: [
      { title: "Design Review", time: "10:00 - 11:00", tone: "cream" },
      { title: "Discussion", time: "16:00 - 17:00", tone: "lavender" },
    ],
  },
  { day: 11 },
  { day: 12 },

  { day: 13 },
  { day: 14 },
  {
    day: 15,
    events: [
      { title: "Market Research", tone: "sage" },
      { title: "Discussion", tone: "lavender" },
    ],
  },
  { day: 16 },
  { day: 17 },
  { day: 18 },
  { day: 19 },

  {
    day: 20,
    events: [
      { title: "Design Review", tone: "cream" },
      { title: "New Deals", tone: "rose" },
    ],
  },
  { day: 21 },
  {
    day: 22,
    events: [
      { title: "Meeting", tone: "sage" },
      { title: "Design Review", tone: "cream" },
    ],
  },
  { day: 23 },
  { day: 24 },
  { day: 25 },
  { day: 26 },

  { day: 27 },
  {
    day: 28,
    events: [
      { title: "Meeting", tone: "sage" },
      { title: "Design Review", tone: "cream" },
      { title: "New Deals", tone: "rose" },
      { title: "Discussion", tone: "lavender" },
    ],
  },
  { day: 29 },
  {
    day: 30,
    events: [
      { title: "Meeting", tone: "sage" },
      { title: "Design Review", tone: "cream" },
      { title: "New Deals", tone: "rose" },
      { title: "Discussion", tone: "lavender" },
    ],
  },
  { day: 1, muted: true },
  { day: 2, muted: true },
  { day: 3, muted: true },
];