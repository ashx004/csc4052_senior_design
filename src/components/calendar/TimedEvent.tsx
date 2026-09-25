import { eventToneClasses } from "@/src/components/calendar/calendarTypes";
import type { EventTone } from "@/src/components/calendar/calendarTypes";

type TimedEventProps = {
  title: string;
  tone: EventTone;
  color?: string;
  height: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  hasConflict?: boolean;
};

export default function TimedEvent({ title, tone, color, height, style, onClick, hasConflict }: TimedEventProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={color ? { ...style, backgroundColor: color, color: "#ffffff" } : style}
      title={hasConflict ? `Schedule conflict: ${title}` : title}
      className={`absolute left-1.5 right-1.5 z-10 rounded-lg px-2.5 py-2 text-xs font-semibold leading-snug shadow-sm ${
        eventToneClasses[tone]
      } ${height} ${hasConflict ? "ring-2 ring-alert-error" : ""}`}
    >
      {title}
    </button>
  );
}
