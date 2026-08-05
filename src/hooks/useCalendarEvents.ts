"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { useCalendarCache } from "@/src/context/CalendarCacheContext";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

// Unlike local events, this is a real remote call to Google Calendar scoped
// by timeMin/timeMax, so (unlike useLocalCalendarEvents) it's cached per
// exact visible range rather than fetched-once-and-filtered — each range
// genuinely needs its own request the first time it's viewed.
function cacheKeyFor(uid: string, dateRange: { start: Date; end: Date }): string {
  return `google:${uid}:${dateRange.start.toISOString()}:${dateRange.end.toISOString()}`;
}

export function useCalendarEvents(dateRange?: { start: Date; end: Date }) {
  const { user } = useAuth();
  const cache = useCalendarCache();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  // Only ever set true for a genuinely cold (uncached) range — a background
  // revalidation of an already-cached range never touches this, so the page
  // never has to hide the calendar grid just to refresh it.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cache.clearForUser(user?.uid ?? null);
  }, [user?.uid, cache]);

  const fetchEvents = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!dateRange) {
        setEvents([]);
        setLoading(false);
        return;
      }

      if (!opts?.background) setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        params.set("timeMin", dateRange.start.toISOString());
        params.set("timeMax", dateRange.end.toISOString());
        params.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);

        const res = await fetch(`/api/calendar/events?${params}`);
        if (!res.ok) throw new Error("Failed to fetch events");

        const data = await res.json();
        const fetched: CalendarEvent[] = data.events ?? [];
        setEvents(fetched);
        if (user) cache.set(cacheKeyFor(user.uid, dateRange), fetched);
      } catch (err) {
        // A background refresh failing shouldn't clobber events already on
        // screen — only a genuine cold-load failure surfaces an error.
        if (!opts?.background) setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, dateRange?.start?.toISOString(), dateRange?.end?.toISOString(), cache]
  );

  useEffect(() => {
    if (!dateRange) {
      setEvents([]);
      return;
    }

    const cached = user ? cache.get(cacheKeyFor(user.uid, dateRange)) : undefined;
    if (cached) {
      setEvents(cached.events);
      fetchEvents({ background: true }); // quietly revalidate
    } else {
      fetchEvents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  return { events, loading, error, refetch: () => fetchEvents() };
}
