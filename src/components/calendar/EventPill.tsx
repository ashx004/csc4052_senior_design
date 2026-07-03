import { eventToneClasses } from "@/src/components/calendar/calendarMockData";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type EventPillProps = {
  event: CalendarEvent;
};

export default function EventPill({ event }: EventPillProps) {
  return (
    <div
      className={`truncate rounded-md px-2 py-1 text-[11px] font-medium leading-tight ${
        eventToneClasses[event.tone]
      }`}
    >
      <span>{event.title}</span>

      {event.time && (
        <span className="block font-normal opacity-80">{event.time}</span>
      )}
    </div>
  );
}