import { eventToneClasses } from "@/src/components/calendar/calendarMockData";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type EventPillProps = {
  event: CalendarEvent;
};

function formatTimeRange(startTime: string, endTime: string): string {
  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  const start = fmt.format(new Date(startTime));
  const end = fmt.format(new Date(endTime));
  return `${start} - ${end}`;
}

export default function EventPill({ event }: EventPillProps) {
  const toneClass = event.tone
    ? eventToneClasses[event.tone]
    : "bg-gray-100 text-gray-700";

  return (
    <div
      className={`truncate rounded-md px-2 py-1 text-[11px] font-medium leading-tight ${toneClass}`}
    >
      <span>{event.title}</span>

      {!event.allDay && event.startTime && event.endTime && (
        <span className="block font-normal opacity-80">
          {formatTimeRange(event.startTime, event.endTime)}
        </span>
      )}
    </div>
  );
}
