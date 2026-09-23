import { eventToneClasses } from "@/src/components/calendar/calendarTypes";
import type { EventTone } from "@/src/components/calendar/calendarTypes";

type TimedEventProps = {
  title: string;
  tone: EventTone;
  color?: string;
  height: string;
  style?: React.CSSProperties;
  onClick?: () => void;
};

export default function TimedEvent({ title, tone, color, height, style, onClick }: TimedEventProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={color ? { ...style, backgroundColor: color, color: "#ffffff" } : style}
      className={`absolute left-1.5 right-1.5 z-10 rounded-lg px-2.5 py-2 text-xs font-semibold leading-snug shadow-sm ${
        eventToneClasses[tone]
      } ${height}`}
    >
      {title}
    </button>
  );
}
