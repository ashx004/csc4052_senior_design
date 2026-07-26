import { eventToneClasses } from "@/src/components/calendar/calendarMockData";
import type { EventTone } from "@/src/components/calendar/calendarTypes";

type TimedEventProps = {
  title: string;
  tone: EventTone;
  height: string;
  style?: React.CSSProperties;
};

export default function TimedEvent({ title, tone, height, style }: TimedEventProps) {
  return (
    <div
      style={style}
      className={`absolute left-1.5 right-1.5 z-10 rounded-lg px-2.5 py-2 text-xs font-semibold leading-snug shadow-sm ${
        eventToneClasses[tone]
      } ${height}`}
    >
      {title}
    </div>
  );
}
