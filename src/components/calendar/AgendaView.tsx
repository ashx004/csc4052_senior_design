import EventPill from "@/src/components/calendar/EventPill";
import { dateKey } from "@/src/library/calendarHelpers";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type AgendaViewProps = { events: CalendarEvent[]; onEventClick?: (event: CalendarEvent) => void };

export default function AgendaView({ events, onEventClick }: AgendaViewProps) {
  const grouped = new Map<string, CalendarEvent[]>();
  [...events].sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).forEach((event) => {
    const key = event.allDay ? event.startTime.slice(0, 10) : dateKey(new Date(event.startTime));
    grouped.set(key, [...(grouped.get(key) ?? []), event]);
  });
  if (grouped.size === 0) return <p className="py-12 text-center text-sm text-text-muted">No events in this period.</p>;
  return <div className="space-y-5">{[...grouped.entries()].map(([date, dayEvents]) => (
    <section key={date}><h3 className="mb-2 text-sm font-semibold text-text-main">{new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</h3>
      <div className="space-y-2">{dayEvents.map((event) => <div key={event.id} className="flex items-start gap-3 rounded-lg border border-border-light bg-bg-main p-3"><div className="min-w-24 pt-1 text-xs text-text-muted">{event.allDay ? "All day" : new Date(event.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</div><div className="min-w-0 flex-1"><EventPill event={event} onClick={onEventClick} />{(event.className || event.kind) && <p className="mt-1 text-xs text-text-muted">{[event.className, event.kind && event.kind !== "event" ? event.kind : ""].filter(Boolean).join(" / ")}</p>}</div></div>)}</div>
    </section>
  ))}</div>;
}
