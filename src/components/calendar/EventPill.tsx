import { eventToneClasses } from "@/src/components/calendar/calendarTypes";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import { AlertTriangle } from "lucide-react";

type EventPillProps = {
  event: CalendarEvent;
  onClick?: (event: CalendarEvent) => void;
  onDragStart?: (event: CalendarEvent) => void;
};

function formatTimeRange(startTime: string, endTime: string): string {
  // IMPORTANT: explicitly pass a timeZone. Without one, Intl.DateTimeFormat
  // falls back to the *runtime's* default timezone. This component has no
  // "use client" directive, so it can render during Next.js's server-side
  // pass — and if the server is configured for UTC (common on Vercel/Docker),
  // every time gets formatted in UTC instead of the viewer's local time,
  // producing a constant offset (e.g. -5h for a US Central Time user).
  //
  // Using the browser's resolved timezone client-side, and falling back to
  // UTC only if it's genuinely unavailable, keeps formatting consistent
  // between server and client render passes.
  const timeZone =
    typeof window !== "undefined"
      ? Intl.DateTimeFormat().resolvedOptions().timeZone
      : "UTC";

  const fmt = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  });
  const start = fmt.format(new Date(startTime));
  const end = fmt.format(new Date(endTime));
  return `${start} - ${end}`;
}

function readableTextColor(background?: string): string | undefined {
  const hex = background?.match(/^#([0-9a-f]{6})$/i)?.[1];
  if (!hex) return undefined;
  const [red, green, blue] = [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16));
  return (red * 299 + green * 587 + blue * 114) / 1000 > 165 ? "#1f1712" : "#ffffff";
}

export default function EventPill({ event, onClick, onDragStart }: EventPillProps) {
  const toneClass = event.tone
    ? eventToneClasses[event.tone]
    : "bg-bg-warm text-text-main";

  return (
    <button
      type="button"
      onClick={(click) => { click.stopPropagation(); onClick?.(event); }}
      draggable={Boolean(onDragStart)}
      onDragStart={(dragEvent) => { dragEvent.dataTransfer.effectAllowed = "move"; onDragStart?.(event); }}
      style={event.color ? { backgroundColor: event.color, color: readableTextColor(event.color) } : undefined}
      title={event.conflictTitles?.length ? `Conflicts with ${event.conflictTitles.join(", ")}` : event.title}
      className={`truncate rounded-md px-2 py-1 text-[11px] font-medium leading-tight ${toneClass} ${event.conflictTitles?.length ? "ring-2 ring-alert-error" : ""}`}
    >
      <span className="flex items-center gap-1">{event.conflictTitles?.length ? <AlertTriangle size={11} aria-label="Schedule conflict" /> : null}{event.title}</span>

      {!event.allDay && event.startTime && event.endTime && (
        <span className="block font-normal opacity-80">
          {formatTimeRange(event.startTime, event.endTime)}
        </span>
      )}
    </button>
  );
}
