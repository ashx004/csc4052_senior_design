"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useCalendarCache } from "@/src/context/CalendarCacheContext";
import type { CalendarEvent, EventTone } from "@/src/components/calendar/calendarTypes";

interface LocalEventDoc {
  title: string;
  description?: string;
  location?: string;
  startTime: string;
  endTime: string;
  allDay: boolean;
  timeZone?: string;
  tone?: EventTone;
  source: "local";
}

// The Firestore query itself was never date-scoped — it always fetched the
// user's whole events collection and filtered by dateRange client-side. So
// unlike Google events (a real remote API call per visible range), there's
// nothing to gain from caching per date range here: the entire collection
// is cached ONCE per user and re-filtered in memory on every navigation,
// meaning switching months/weeks/days after the first load costs zero
// network calls instead of a fresh Firestore read every time.
function cacheKeyFor(uid: string): string {
  return `local-all:${uid}`;
}

export function useLocalCalendarEvents(dateRange?: { start: Date; end: Date }) {
  const { user } = useAuth();
  const cache = useCalendarCache();
  const [allUserEvents, setAllUserEvents] = useState<CalendarEvent[]>([]);
  // Only ever set true for a genuinely cold (uncached) fetch — a background
  // revalidation of already-cached data never touches this, so the page
  // never has to hide the calendar grid just to refresh it.
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    cache.clearForUser(user?.uid ?? null);
  }, [user?.uid, cache]);

  const fetchAll = useCallback(
    async (opts?: { background?: boolean }) => {
      if (!user) {
        setAllUserEvents([]);
        setLoading(false);
        return;
      }

      if (!opts?.background) setLoading(true);
      setError(null);
      try {
        const eventsRef = collection(db, "users", user.uid, "events");
        const snapshot = await getDocs(eventsRef);

        const fetched: CalendarEvent[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data() as LocalEventDoc;
          fetched.push({
            id: doc.id,
            title: data.title,
            description: data.description,
            location: data.location,
            startTime: data.startTime,
            endTime: data.endTime,
            allDay: data.allDay,
            timeZone: data.timeZone,
            tone: data.tone,
            source: "local",
          });
        });

        setAllUserEvents(fetched);
        cache.set(cacheKeyFor(user.uid), fetched);
      } catch (err) {
        // A background refresh failing shouldn't clobber events already on
        // screen — only a genuine cold-load failure surfaces an error.
        if (!opts?.background) setError(err instanceof Error ? err.message : "Failed to fetch local events");
      } finally {
        setLoading(false);
      }
    },
    [user?.uid, cache]
  );

  useEffect(() => {
    if (!user) {
      setAllUserEvents([]);
      return;
    }

    const cached = cache.get(cacheKeyFor(user.uid));
    if (cached) {
      setAllUserEvents(cached.events);
      fetchAll({ background: true }); // quietly revalidate
    } else {
      fetchAll();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);

  const events = useMemo(() => {
    if (!dateRange) return [];
    const rangeStart = dateRange.start.getTime();
    const rangeEnd = dateRange.end.getTime();
    return allUserEvents.filter((e) => {
      const eventStart = new Date(e.startTime).getTime();
      const eventEnd = new Date(e.endTime).getTime();
      return eventEnd > rangeStart && eventStart < rangeEnd;
    });
  }, [allUserEvents, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  return { events, loading, error, refetch: () => fetchAll() };
}
