import EventPill from "@/src/components/calendar/EventPill";
import {
  monthDays,
  monthWeekDays,
} from "@/src/components/calendar/calendarMockData";

export default function MonthView() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border-light bg-white">
      <div className="grid grid-cols-7 border-b border-border-light bg-bg-container">
        {monthWeekDays.map((day) => (
          <div
            key={day}
            className="border-r border-border-light py-3 text-center text-xs font-semibold text-text-muted last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {monthDays.map((calendarDay, index) => (
          <article
            key={`${calendarDay.day}-${index}`}
            className={`min-h-[118px] border-r border-b border-border-light p-3 ${
              index % 7 === 6 ? "border-r-0" : ""
            } ${calendarDay.muted ? "bg-bg-container" : "bg-white"} ${
              calendarDay.selected ? "bg-bg-warm" : ""
            }`}
          >
            <div
              className={`mb-3 text-xs ${
                calendarDay.muted ? "text-text-muted" : "text-text-main"
              }`}
            >
              {calendarDay.day}
            </div>

            <div className="space-y-1.5">
              {calendarDay.events?.map((event, eventIndex) => (
                <EventPill key={`${event.title}-${eventIndex}`} event={event} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}