"use client";

import { useState, useEffect, useCallback } from "react";
import type { CalendarConnectionStatus } from "@/src/components/calendar/calendarTypes";

export function useCalendarConnection() {
    const [status, setStatus] = useState<CalendarConnectionStatus>("loading");
    const checkStatus = useCallback(async () => {
        setStatus("loading");
        try {
            const res = await fetch("/api/calendar/status");

            if (!res.ok) throw new Error("Failed to check status");
            const data = await res.json();
            setStatus(data.connected ? "connected" : "disconnected");
        }
        catch {
            setStatus("disconnected");
        }
    }, []);

    useEffect(() => { checkStatus(); }, [checkStatus]);

    return { status, refresh: checkStatus };
}