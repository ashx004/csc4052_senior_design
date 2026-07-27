"use client";

import { useState, useEffect, useCallback } from "react";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

export function useCalendarEvents(dateRange?: { start: Date; end: Date }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (!dateRange) {
      setEvents([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("timeMin", dateRange.start.toISOString());
      params.set("timeMax", dateRange.end.toISOString());
      params.set("timeZone", Intl.DateTimeFormat().resolvedOptions().timeZone);

      const res = await fetch(`/api/calendar/events?${params}`);
      if (!res.ok) throw new Error("Failed to fetch events");

      const data = await res.json();
      setEvents(data.events ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return { events, loading, error, refetch: fetchEvents };
}
