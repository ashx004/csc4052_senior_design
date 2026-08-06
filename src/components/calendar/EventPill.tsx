import { eventToneClasses } from "@/src/components/calendar/calendarTypes";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type EventPillProps = {
  event: CalendarEvent;
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

export default function EventPill({ event }: EventPillProps) {
  const toneClass = event.tone
    ? eventToneClasses[event.tone]
    : "bg-bg-warm text-text-main";

  return (
    <div
      className={`truncate rounded-md px-2 py-1 text-[11px] font-medium leading-tight ${toneClass}`}
    >
      <span>{event.title}</span>

      {!event.allDay && event.startTime && event.endTime && (
        <span className="block font-normal opacity-80">
          {formatTimeRange(event.startTime, event.endTime)}
        </span>
      )}
    </div>
  );
}