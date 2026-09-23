"use client";

import { useState, useMemo } from "react";
import { doc, updateDoc } from "firebase/firestore";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
} from "lucide-react";

import AddEventModal from "@/src/components/calendar/AddEventModal";
import DayView from "@/src/components/calendar/DayView";
import AgendaView from "@/src/components/calendar/AgendaView";
import MonthView from "@/src/components/calendar/MonthView";
import WeekView from "@/src/components/calendar/WeekView";
import GoogleCalendarConnect from "@/src/components/calendar/GoogleCalendarConnect";
import { useCalendarConnection } from "@/src/hooks/useCalendarConnection";
import { useCalendarEvents } from "@/src/hooks/useCalendarEvents";
import { useLocalCalendarEvents } from "@/src/hooks/useLocalCalendarEvents";
import { getWeekStart } from "@/src/library/calendarHelpers";

import type { CalendarEvent, CalendarView } from "@/src/components/calendar/calendarTypes";
import { useSetPageContext } from "@/src/context/AIPageContext";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/library/firebase";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage() {
  const { user } = useAuth();
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [showAddEvent, setShowAddEvent] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showLocal, setShowLocal] = useState(true);
  const [showGoogle, setShowGoogle] = useState(true);
  const [classFilter, setClassFilter] = useState("all");
  const { status, refresh } = useCalendarConnection();

  // Compute the date range to fetch based on the current view.
  const dateRange = useMemo(() => {
    if (status !== "connected") return undefined;

    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "month" || view === "agenda") {
      // Fetch the full visible grid: from the Sunday before the 1st
      // through the Saturday after the last day.
      start.setDate(1);
      start.setDate(start.getDate() - start.getDay()); // back to Sun
      end.setMonth(end.getMonth() + 1, 0); // last day of month
      end.setDate(end.getDate() + (6 - end.getDay())); // forward to Sat
    } else if (view === "week") {
      const weekStart = getWeekStart(start);
      start.setTime(weekStart.getTime());
      end.setTime(weekStart.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      // Day — just the selected day.
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }, [currentDate, view, status]);

  // Local events always fetch regardless of Google connection status.
  const localDateRange = useMemo(() => {
    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "month" || view === "agenda") {
      start.setDate(1);
      start.setDate(start.getDate() - start.getDay());
      end.setMonth(end.getMonth() + 1, 0);
      end.setDate(end.getDate() + (6 - end.getDay()));
    } else if (view === "week") {
      const weekStart = getWeekStart(start);
      start.setTime(weekStart.getTime());
      end.setTime(weekStart.getTime());
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
    } else {
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
    }

    return { start, end };
  }, [currentDate, view]);

  const { events, error: eventsError } = useCalendarEvents(dateRange);
  const { events: localEvents, loading: localLoading, error: localEventsError, refetch: refetchLocal } = useLocalCalendarEvents(localDateRange);

  const allEvents = useMemo(() => [...events, ...localEvents], [events, localEvents]);
  const classOptions = useMemo(() => Array.from(new Map(
    allEvents.filter((event) => event.classId && event.className).map((event) => [event.classId!, event.className!])
  ).entries()), [allEvents]);
  const filteredEvents = useMemo(() => allEvents.filter((event) =>
    (showLocal || event.source !== "local") &&
    (showGoogle || event.source !== "google") &&
    (classFilter === "all" || event.classId === classFilter)
  ), [allEvents, showLocal, showGoogle, classFilter]);

  // ── Navigation handlers ──────────────────────────────────────────────────

  function navigateDate(direction: -1 | 1) {
    const nextDate = new Date(currentDate);
    if (view === "month" || view === "agenda") {
      // Start from the first so January 29–31 cannot overflow past February.
      nextDate.setDate(1);
      nextDate.setMonth(nextDate.getMonth() + direction);
    }
    else if (view === "week") nextDate.setDate(nextDate.getDate() + direction * 7);
    else nextDate.setDate(nextDate.getDate() + direction);

    setCurrentDate(nextDate);
    // WeekView and DayView render selectedDate, so navigation must keep it
    // aligned with the date used for the header and event range.
    if (view !== "month") setSelectedDate(new Date(nextDate));
  }

  function changeView(nextView: CalendarView) {
    setView(nextView);
    // A month can be navigated without changing its selected day. When moving
    // into a date-driven view, begin at the month currently on screen.
    if (nextView !== "month" && nextView !== "agenda") setSelectedDate(new Date(currentDate));
  }

  function goToToday() {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    setCurrentDate(new Date(date));
  }

  async function handleMoveEvent(event: CalendarEvent, targetDate: Date) {
    if (!user || event.source !== "local" || event.seriesId) return;
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    const movedStart = new Date(targetDate);
    const movedEnd = new Date(targetDate);
    if (event.allDay) {
      const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
      const startDate = `${movedStart.getFullYear()}-${String(movedStart.getMonth() + 1).padStart(2, "0")}-${String(movedStart.getDate()).padStart(2, "0")}`;
      movedEnd.setDate(movedEnd.getDate() + durationDays);
      const endDate = `${movedEnd.getFullYear()}-${String(movedEnd.getMonth() + 1).padStart(2, "0")}-${String(movedEnd.getDate()).padStart(2, "0")}`;
      await updateDoc(doc(db, "users", user.uid, "events", event.id), { startTime: startDate, endTime: endDate });
      return;
    }
    movedStart.setHours(start.getHours(), start.getMinutes(), 0, 0);
    movedEnd.setTime(movedStart.getTime() + (end.getTime() - start.getTime()));
    await updateDoc(doc(db, "users", user.uid, "events", event.id), { startTime: movedStart.toISOString(), endTime: movedEnd.toISOString() });
  }

  // ── Header text ──────────────────────────────────────────────────────────

  const headerText =
    view === "month" || view === "agenda"
      ? `${MONTH_NAMES[currentDate.getMonth()]} ${currentDate.getFullYear()}`
      : view === "week"
        ? (() => {
            const ws = getWeekStart(currentDate);
            const we = new Date(ws);
            we.setDate(we.getDate() + 6);
            return `${MONTH_NAMES[ws.getMonth()]} ${ws.getDate()} – ${we.getDate()}, ${we.getFullYear()}`;
          })()
        : `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`;

  // ── Shared view button class ─────────────────────────────────────────────

  useSetPageContext(
    {
      page: "calendar",
      label: "Calendar",
      summary: `The student is viewing their calendar in ${view} view. Real events exist here — use the list_calendar_events/create_calendar_event/update_calendar_event/delete_calendar_event tools rather than assuming or inventing a schedule.`,
    },
    [view]
  );

  function getViewButtonClass(buttonView: CalendarView) {
    const isActive = view === buttonView;
    return `px-4 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-primary text-text-inverse"
        : "text-text-main hover:bg-bg-warm"
    }`;
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8">
      <div className="mx-auto max-w-7xl">
        {/* ── Page header ── */}
        <header className="mb-7 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 mt-9 flex items-center gap-2 text-xs text-text-muted">
              <CalendarDays size={15} strokeWidth={1.8} />
              <span>Dashboard</span>
              <span>/</span>
              <span className="font-medium text-text-main">Calendar</span>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-text-main">
              Calendar
            </h1>
          </div>

          <div className="relative flex items-center gap-3">
            <button
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              className="
                inline-flex items-center gap-2 rounded-lg
                border border-border-light bg-bg-container
                px-4 py-2 text-sm font-medium text-text-main
                shadow-sm transition hover:bg-bg-warm" >

              <Filter size={15} strokeWidth={1.8} />
              Filter
            </button>
            {showFilters && (
              <div className="absolute right-0 top-11 z-20 w-64 rounded-lg border border-border-light bg-bg-container p-4 shadow-lg">
                <p className="text-sm font-semibold text-text-main">Show</p>
                <label className="mt-3 flex items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={showLocal} onChange={(change) => setShowLocal(change.target.checked)} /> My events</label>
                <label className="mt-2 flex items-center gap-2 text-sm text-text-main"><input type="checkbox" checked={showGoogle} onChange={(change) => setShowGoogle(change.target.checked)} /> Google Calendar</label>
                {classOptions.length > 0 && <label className="mt-3 block text-sm text-text-main">Class<select value={classFilter} onChange={(change) => setClassFilter(change.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-main px-2 py-1.5 text-sm"><option value="all">All classes</option>{classOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>}
              </div>
            )}
            <button
              type="button"
              onClick={() => { setSelectedEvent(null); setShowAddEvent(true); }}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition hover:bg-primary-hover"
            >
              <Plus size={16} strokeWidth={2} />
              Add Event
            </button>
          </div>
        </header>

        {/* ── Calendar card ── */}
        <div className="rounded-3xl border border-border-light bg-bg-container p-6 shadow-sm">
          {/* ── Toolbar ── */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border-light pb-4">
            <div className="flex items-center gap-8">
              <h2 className="text-xl font-semibold text-text-main">
                {headerText}
              </h2>

              <div
                className="
                  flex items-center overflow-hidden rounded-lg
                  border border-border-light bg-bg-container" >
                <button
                  type="button"
                  onClick={() => navigateDate(-1)}
                  className="flex h-9 w-10 items-center justify-center border-r border-border-light text-text-muted transition hover:bg-bg-warm"
                  aria-label="Previous"
                >
                  <ChevronLeft size={17} strokeWidth={2} />
                </button>
                <button
                  type="button"
                  onClick={goToToday}
                  className="h-9 px-4 text-sm font-medium text-text-main transition hover:bg-bg-warm"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => navigateDate(1)}
                  className="flex h-9 w-10 items-center justify-center border-l border-border-light text-text-muted transition hover:bg-bg-warm"
                  aria-label="Next"
                >
                  <ChevronRight size={17} strokeWidth={2} />
                </button>
              </div>
            </div>

            <div
              className="
                flex overflow-hidden rounded-lg
                border border-border-light bg-bg-container" >
              <button
                type="button"
                onClick={() => changeView("month")}
                className={`${getViewButtonClass("month")} border-r border-border-light`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => changeView("week")}
                className={`${getViewButtonClass("week")} border-r border-border-light`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => changeView("day")}
                className={`${getViewButtonClass("day")} border-r border-border-light`}
              >
                Daily
              </button>
              <button
                type="button"
                onClick={() => changeView("agenda")}
                className={getViewButtonClass("agenda")}
              >
                Agenda
              </button>
            </div>
          </div>

          {/* Local events (Firestore client SDK, fast) never depended on
              Google's connection status — they used to sit behind whichever
              of two full-page blocking states was slower: the connection
              status check (a real network round trip on every mount, with
              no caching) or, once connected, Google's own events fetch.
              Neither has anything to do with whether local events are ready
              to show. Now the grid renders as soon as local events resolve,
              same "only a genuinely empty first load blocks" rule as
              before — Google's events (via allEvents, [] until connected/
              loaded) and the connect banner just layer in once status
              resolves, without holding up anything that didn't depend on
              them. */}
          {localLoading && allEvents.length === 0 ? (
            <p className="py-12 text-center text-sm text-text-muted">
              Loading events...
            </p>
          ) : (
            <>
              {eventsError && status === "connected" && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {eventsError}
                </div>
              )}
              {view === "month" && (
                <MonthView
                  events={filteredEvents}
                  currentYear={currentDate.getFullYear()}
                  currentMonth={currentDate.getMonth()}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  onEventClick={(event) => { setSelectedEvent(event); setShowAddEvent(true); }}
                  onEventMove={(event, date) => void handleMoveEvent(event, date).catch((error) => console.error("Couldn't reschedule event:", error))}
                />
              )}
              {view === "week" && (
                <WeekView
                  events={filteredEvents}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                  onEventClick={(event) => { setSelectedEvent(event); setShowAddEvent(true); }}
                />
              )}
              {view === "day" && (
                <DayView events={filteredEvents} selectedDate={selectedDate} onEventClick={(event) => { setSelectedEvent(event); setShowAddEvent(true); }} />
              )}
              {localEventsError && (
                <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {localEventsError}
                </div>
              )}
              {view === "agenda" && <AgendaView events={filteredEvents} onEventClick={(event) => { setSelectedEvent(event); setShowAddEvent(true); }} />}
              {status === "disconnected" && (
                <div className="mt-6">
                  <GoogleCalendarConnect onConnected={refresh} />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <AddEventModal
        isOpen={showAddEvent}
        onClose={() => { setShowAddEvent(false); setSelectedEvent(null); }}
        event={selectedEvent}
        events={allEvents}
        onEventAdded={() => {
          refetchLocal();
        }}
      />
    </section>
  );
}
