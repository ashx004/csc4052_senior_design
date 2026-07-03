import EventPill from "@/src/components/calendar/EventPill";
import {
  monthDays,
  monthWeekDays,
} from "@/src/components/calendar/calendarMockData";

export default function MonthView() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e1dbd1] bg-white">
      <div className="grid grid-cols-7 border-b border-[#e1dbd1] bg-[#fbfaf8]">
        {monthWeekDays.map((day) => (
          <div
            key={day}
            className="border-r border-[#e1dbd1] py-3 text-center text-xs font-semibold text-[#6b675f] last:border-r-0"
          >
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {monthDays.map((calendarDay, index) => (
          <article
            key={`${calendarDay.day}-${index}`}
            className={`min-h-[118px] border-r border-b border-[#e1dbd1] p-3 ${
              index % 7 === 6 ? "border-r-0" : ""
            } ${calendarDay.muted ? "bg-[#faf9f7]" : "bg-white"} ${
              calendarDay.selected ? "bg-[#f1eadf]" : ""
            }`}
          >
            <div
              className={`mb-3 text-xs ${
                calendarDay.muted ? "text-[#b7afa4]" : "text-[#5f5a52]"
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