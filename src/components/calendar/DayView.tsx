import EventPill from "@/src/components/calendar/EventPill";
import TimedEvent from "@/src/components/calendar/TimedEvent";
import { timeSlots } from "@/src/components/calendar/calendarMockData";

export default function DayView() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#e1dbd1] bg-white">
      <div className="border-b border-[#e1dbd1] bg-[#eef3fb] px-6 py-5">
        <p className="text-sm font-medium text-[#6b7280]">
          Thursday, September 10
        </p>
        <h3 className="mt-1 text-3xl font-semibold text-[#4256d6]">10</h3>
      </div>

      <div className="grid grid-cols-[95px_1fr] border-b border-[#e1dbd1]">
        <div className="flex items-center justify-end border-r border-[#e1dbd1] bg-[#fbfaf8] px-4 py-4 text-xs text-[#6b7280]">
          All day
        </div>

        <div className="space-y-2 p-4">
          <EventPill event={{ title: "Hike Adventure", tone: "blue" }} />
          <EventPill event={{ title: "Day off", tone: "sage" }} />
        </div>
      </div>

      <div className="max-h-[620px] overflow-y-auto">
        {timeSlots.map((time) => (
          <div key={`day-${time}`} className="grid grid-cols-[95px_1fr]">
            <div className="h-20 border-r border-b border-[#e1dbd1] bg-[#fbfaf8] px-4 pt-2 text-right text-xs text-[#6b7280]">
              {time}
            </div>

            <div className="relative h-20 border-b border-[#e1dbd1] p-2">
              {time === "06:00" && (
                <TimedEvent
                  title="06:00-07:00 Online meeting"
                  tone="rose"
                  height="h-[70px]"
                />
              )}

              {time === "08:00" && (
                <TimedEvent
                  title="08:00-09:00 Review assignments"
                  tone="cream"
                  height="h-[70px]"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}