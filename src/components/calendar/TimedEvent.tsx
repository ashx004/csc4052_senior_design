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
  done?: boolean;
  draggable?: boolean;
  onDragStart?: (e: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: (e: React.DragEvent<HTMLButtonElement>) => void;
};

export default function TimedEvent({ title, tone, color, height, style, onClick, hasConflict, done, draggable, onDragStart, onDragEnd }: TimedEventProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={color ? { ...style, backgroundColor: color, color: "#ffffff" } : style}
      title={`${done ? "Done: " : ""}${hasConflict ? `Schedule conflict: ${title}` : title}`}
      className={`absolute left-1.5 right-1.5 z-10 rounded-lg px-2.5 py-2 text-xs font-semibold leading-snug shadow-sm ${
        eventToneClasses[tone]
      } ${height} ${hasConflict ? "ring-2 ring-alert-error" : ""} ${done ? "line-through opacity-60" : ""} ${draggable ? "cursor-grab" : ""}`}
    >
      {title}
    </button>
  );
}
