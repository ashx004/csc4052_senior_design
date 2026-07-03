import EventPill from "@/src/components/calendar/EventPill";
import TimedEvent from "@/src/components/calendar/TimedEvent";
import {
  timeSlots,
  weekDays,
} from "@/src/components/calendar/calendarMockData";

export default function WeekView() {
  return (
    <div className="overflow-x-auto">
      <div className="overflow-hidden rounded-2xl border border-[#e1dbd1] bg-white">
        <div className="grid min-w-[900px] grid-cols-[80px_repeat(7,minmax(110px,1fr))] border-b border-[#e1dbd1]">
          <div className="border-r border-[#e1dbd1] bg-[#fbfaf8]" />

          {weekDays.map((day) => (
            <div
              key={day.label}
              className={`border-r border-[#e1dbd1] px-4 py-3 text-center last:border-r-0 ${
                day.selected ? "bg-[#eef3fb]" : "bg-[#fbfaf8]"
              }`}
            >
              <p className="text-xs font-medium text-[#6b7280]">
                {day.label}
              </p>
              <p
                className={`mt-1 text-lg font-semibold ${
                  day.selected ? "text-[#4256d6]" : "text-[#27251f]"
                }`}
              >
                {day.day}
              </p>
            </div>
          ))}
        </div>

        <div className="max-h-[620px] min-w-[900px] overflow-y-auto">
          <div className="grid grid-cols-[80px_repeat(7,minmax(110px,1fr))] border-b border-[#e1dbd1]">
            <div className="flex items-center justify-end border-r border-[#e1dbd1] bg-[#fbfaf8] px-3 text-xs text-[#6b7280]">
              All day
            </div>

            {weekDays.map((day) => (
              <div
                key={`all-day-${day.label}`}
                className="min-h-[64px] border-r border-[#e1dbd1] p-2 last:border-r-0"
              >
                {day.label === "Thu" && (
                  <div className="space-y-1">
                    <EventPill
                      event={{ title: "Hike Adventure", tone: "blue" }}
                    />
                    <EventPill event={{ title: "Day off", tone: "sage" }} />
                  </div>
                )}

                {day.label === "Sun" && (
                  <EventPill
                    event={{ title: "Side project X", tone: "brown" }}
                  />
                )}
              </div>
            ))}
          </div>

          {timeSlots.map((time) => (
            <div
              key={time}
              className="grid grid-cols-[80px_repeat(7,minmax(110px,1fr))]"
            >
              <div className="h-16 border-r border-b border-[#e1dbd1] bg-[#fbfaf8] px-3 pt-2 text-right text-xs text-[#6b7280]">
                {time}
              </div>

              {weekDays.map((day) => (
                <div
                  key={`${day.label}-${time}`}
                  className="relative h-16 border-r border-b border-[#e1dbd1] p-1.5 last:border-r-0"
                >
                  {day.label === "Tue" && time === "05:00" && (
                    <TimedEvent
                      title="05:00-06:30 Morning walk"
                      tone="blue"
                      height="h-[92px]"
                    />
                  )}

                  {day.label === "Thu" && time === "06:00" && (
                    <TimedEvent
                      title="06:00-07:00 Online meeting"
                      tone="rose"
                      height="h-[56px]"
                    />
                  )}

                  {day.label === "Sat" && time === "01:00" && (
                    <TimedEvent
                      title="01:00-04:00 Overnight Flight EG2525"
                      tone="blue"
                      height="h-[188px]"
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}