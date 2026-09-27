"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useCalendarCache } from "@/src/context/CalendarCacheContext";
import { dateKey } from "@/src/library/calendarHelpers";
import type { CalendarEvent, EventTone } from "@/src/components/calendar/calendarTypes";
import { DATA_CHANGED_EVENT } from "@/src/library/dataChanged";

interface LocalEventDoc {
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  timeZone?: string;
  tone?: EventTone;
  kind?: CalendarEvent["kind"];
  classId?: string;
  className?: string;
  recurrence?: CalendarEvent["recurrence"];
  recurrenceUntil?: string;
  reminderMinutes?: number;
}

function cacheKeyFor(uid: string): string {
  return `local-all:${uid}`;
}

function parseCalendarDate(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatCalendarDate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function advanceOccurrence(value: Date, recurrence: NonNullable<CalendarEvent["recurrence"]>): Date {
  const next = new Date(value);
  if (recurrence === "daily") next.setDate(next.getDate() + 1);
  else if (recurrence === "weekly") next.setDate(next.getDate() + 7);
  else if (recurrence === "monthly") {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
  }
  return next;
}

function expandRecurringEvent(event: CalendarEvent, range: { start: Date; end: Date }): CalendarEvent[] {
  if (!event.recurrence || event.recurrence === "none") return [event];
  const expanded: CalendarEvent[] = [];
  const until = event.recurrenceUntil ? parseCalendarDate(event.recurrenceUntil) : null;
  const originalStart = event.allDay ? parseCalendarDate(event.startTime) : new Date(event.startTime);
  const originalEnd = event.allDay ? parseCalendarDate(event.endTime) : new Date(event.endTime);
  const durationMs = originalEnd.getTime() - originalStart.getTime();
  const durationDays = event.allDay
    ? Math.round((Date.UTC(originalEnd.getFullYear(), originalEnd.getMonth(), originalEnd.getDate()) - Date.UTC(originalStart.getFullYear(), originalStart.getMonth(), originalStart.getDate())) / 86_400_000)
    : 0;
  let occurrenceStart = new Date(originalStart);

  for (let count = 0; count < 10_000 && occurrenceStart <= range.end; count += 1) {
    if (until && occurrenceStart > until) break;
    const occurrenceEnd = event.allDay
      ? new Date(occurrenceStart.getFullYear(), occurrenceStart.getMonth(), occurrenceStart.getDate() + durationDays)
      : new Date(occurrenceStart.getTime() + durationMs);
    if (occurrenceEnd > range.start) {
      const occurrenceKey = event.allDay ? formatCalendarDate(occurrenceStart) : occurrenceStart.toISOString();
      expanded.push({
        ...event,
        id: `${event.id}@${occurrenceKey}`,
        seriesId: event.id,
        startTime: event.allDay ? formatCalendarDate(occurrenceStart) : occurrenceStart.toISOString(),
        endTime: event.allDay ? formatCalendarDate(occurrenceEnd) : occurrenceEnd.toISOString(),
      });
    }
    occurrenceStart = advanceOccurrence(occurrenceStart, event.recurrence);
  }
  return expanded;
}

export function useLocalCalendarEvents(dateRange?: { start: Date; end: Date }) {
  const { user } = useAuth();
  const cache = useCalendarCache();
  const [allUserEvents, setAllUserEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    cache.clearForUser(user?.uid ?? null);
  }, [user?.uid, cache]);

  useEffect(() => {
    if (!user) {
      setAllUserEvents([]);
      setLoading(false);
      return;
    }

    const cached = cache.get(cacheKeyFor(user.uid));
    if (cached) setAllUserEvents(cached.events);
    else setLoading(true);

    return onSnapshot(
      collection(db, "users", user.uid, "events"),
      (snapshot) => {
        const fetched: CalendarEvent[] = snapshot.docs.map((eventDoc) => {
          const data = eventDoc.data() as LocalEventDoc;
          return {
            id: eventDoc.id,
            title: data.title,
            description: data.description,
            location: data.location,
            startTime: data.startTime,
            endTime: data.endTime,
            allDay: data.allDay,
            timeZone: data.timeZone,
            tone: data.tone,
            kind: data.kind,
            classId: data.classId,
            className: data.className,
            recurrence: data.recurrence,
            recurrenceUntil: data.recurrenceUntil,
            reminderMinutes: data.reminderMinutes,
            source: "local",
          };
        });
        setAllUserEvents(fetched);
        cache.set(cacheKeyFor(user.uid), fetched);
        setLoading(false);
        setError(null);
      },
      (snapshotError) => {
        setLoading(false);
        setError(snapshotError instanceof Error ? snapshotError.message : "Failed to watch local events");
      }
    );
  }, [user?.uid, cache, refreshVersion]);

  // The AI chat added, moved or deleted something: refresh quietly.
  useEffect(() => {
    const refresh = () => setRefreshVersion((version) => version + 1);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, []);

  const events = useMemo(() => {
    if (!dateRange) return [];
    const rangeStart = dateRange.start.getTime();
    const rangeEnd = dateRange.end.getTime();
    const startDate = dateKey(dateRange.start);
    const endDate = dateKey(dateRange.end);
    const expanded = allUserEvents.flatMap((event) => expandRecurringEvent(event, dateRange));
    return expanded.filter((event) => {
      if (event.allDay) {
        return event.endTime.slice(0, 10) > startDate && event.startTime.slice(0, 10) <= endDate;
      }
      const eventStart = new Date(event.startTime).getTime();
      const eventEnd = new Date(event.endTime).getTime();
      return eventEnd > rangeStart && eventStart < rangeEnd;
    });
  }, [allUserEvents, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  return { events, loading, error, refetch: () => setRefreshVersion((version) => version + 1) };
}
