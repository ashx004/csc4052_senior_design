"use client";

import { useState, useEffect, useCallback } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
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

export function useLocalCalendarEvents(dateRange?: { start: Date; end: Date }) {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!user || !dateRange) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const eventsRef = collection(db, "users", user.uid, "events");
      const snapshot = await getDocs(eventsRef);

      const rangeStart = dateRange.start.getTime();
      const rangeEnd = dateRange.end.getTime();

      const allEvents: CalendarEvent[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as LocalEventDoc;
        const eventStart = new Date(data.startTime).getTime();
        const eventEnd = new Date(data.endTime).getTime();

        if (eventEnd > rangeStart && eventStart < rangeEnd) {
          allEvents.push({
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
        }
      });

      setEvents(allEvents);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch local events");
    } finally {
      setLoading(false);
    }
  }, [user?.uid, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}
