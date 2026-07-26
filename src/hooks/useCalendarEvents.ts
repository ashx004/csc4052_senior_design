"use client";

import { useState, useEffect, useCallback } from "react";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

export function useCalendarEvents( dateRange?: { start: Date; end: Date }) {
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchEvents = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams();
            if (dateRange?.start) params.set("timeMin", dateRange.start.toISOString());
            if (dateRange?.end) params.set("timeMax", dateRange.end.toISOString());

            const res = await fetch(`/api/calendar/events?${params}`);
            
            if (!res.ok) throw new Error("Failed to fetch events");

            const data = await res.json();
            setEvents(data.events ?? []);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : "Unknown error");
        }
        finally {
            setLoading(false);
        }
    }, [dateRange?.start?.toISOString(),
    dateRange?.end?.toISOString()]);

    return { events, loading, error, refectch: fetchEvents };
}