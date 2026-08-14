"use client";

import { createContext, useContext, useMemo, useRef } from "react";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

// In-memory, per-session cache for calendar event data (both Google-synced
// and locally-added events). Without this, switching months/weeks/days
// re-fetched from scratch every time, and the page hid the whole grid
// behind "Loading events..." while it did — jarring on every navigation,
// even for a range already fetched a moment ago. Mirrors
// AdvisingCacheContext's in-memory-only approach (no localStorage needed —
// this exists to avoid a loading flash within a session, not to persist
// across visits).
//
// Cache entries are looked up by a caller-chosen string key (see
// useLocalCalendarEvents/useCalendarEvents for what they key on), scoped
// per user via clearForUser: the whole store is wiped whenever the
// signed-in uid changes, so switching accounts on the same device never
// briefly shows one student's cached schedule to another.
type CacheEntry = { events: CalendarEvent[]; fetchedAt: number };

type ContextValue = {
  get(key: string): CacheEntry | undefined;
  set(key: string, events: CalendarEvent[]): void;
  clearForUser(uid: string | null): void;
};

const Ctx = createContext<ContextValue | null>(null);

export function CalendarCacheProvider({ children }: { children: React.ReactNode }) {
  // A ref, not state — cache reads/writes must never themselves trigger a
  // re-render (that's the hooks' own state's job), and a Map held in a ref
  // survives across renders/navigations for the life of the provider.
  const storeRef = useRef(new Map<string, CacheEntry>());
  const uidRef = useRef<string | null>(null);

  const value = useMemo<ContextValue>(
    () => ({
      get: (key) => storeRef.current.get(key),
      set: (key, events) => {
        storeRef.current.set(key, { events, fetchedAt: Date.now() });
      },
      clearForUser: (uid) => {
        if (uidRef.current !== uid) {
          storeRef.current.clear();
          uidRef.current = uid;
        }
      },
    }),
    []
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCalendarCache() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCalendarCache must be used within CalendarCacheProvider");
  return ctx;
}
