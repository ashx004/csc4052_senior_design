"use client";

import { useEffect, useRef } from "react";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

const MAX_REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * Delivers opted-in browser reminders for events currently visible in the
 * calendar. Notifications intentionally remain best-effort: a service worker
 * is required for notifications after the Calendar page has been left or the
 * site has been closed.
 */
export function useCalendarReminders(events: CalendarEvent[]) {
  const delivered = useRef(new Set<string>());

  useEffect(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;

    const now = Date.now();
    const timers: number[] = [];
    for (const event of events) {
      if (!event.reminderMinutes || event.allDay) continue;
      const dueAt = new Date(event.startTime).getTime() - event.reminderMinutes * 60_000;
      const delay = dueAt - now;
      if (delay < 0 || delay > MAX_REMINDER_WINDOW_MS || delivered.current.has(event.id)) continue;

      timers.push(window.setTimeout(() => {
        if (delivered.current.has(event.id)) return;
        delivered.current.add(event.id);
        new Notification(event.title, {
          body: `${event.reminderMinutes} minutes before${event.location ? ` · ${event.location}` : ""}`,
          tag: `catalyst-calendar-${event.id}`,
        });
      }, delay));
    }

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [events]);
}
