"use client";

import { useState, useMemo } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
} from "lucide-react";

import AddEventModal from "@/src/components/calendar/AddEventModal";
import DayView from "@/src/components/calendar/DayView";
import MonthView from "@/src/components/calendar/MonthView";
import WeekView from "@/src/components/calendar/WeekView";
import GoogleCalendarConnect from "@/src/components/calendar/GoogleCalendarConnect";
import { useCalendarConnection } from "@/src/hooks/useCalendarConnection";
import { useCalendarEvents } from "@/src/hooks/useCalendarEvents";
import { useLocalCalendarEvents } from "@/src/hooks/useLocalCalendarEvents";
import { getWeekStart } from "@/src/library/calendarHelpers";

import type { CalendarView } from "@/src/components/calendar/calendarTypes";
import { useSetPageContext } from "@/src/context/AIPageContext";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("month");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const [showAddEvent, setShowAddEvent] = useState(false);
  const { status, refresh } = useCalendarConnection();

  // Compute the date range to fetch based on the current view.
  const dateRange = useMemo(() => {
    if (status !== "connected") return undefined;

    const start = new Date(currentDate);
    const end = new Date(currentDate);

    if (view === "month") {
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

    if (view === "month") {
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

  const { events, loading: eventsLoading, error: eventsError } = useCalendarEvents(dateRange);
  const { events: localEvents, refetch: refetchLocal } = useLocalCalendarEvents(localDateRange);

  const allEvents = useMemo(() => [...events, ...localEvents], [events, localEvents]);

  // ── Navigation handlers ──────────────────────────────────────────────────

  function goToPrev() {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() - 1);
    else if (view === "week") d.setDate(d.getDate() - 7);
    else d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  }

  function goToNext() {
    const d = new Date(currentDate);
    if (view === "month") d.setMonth(d.getMonth() + 1);
    else if (view === "week") d.setDate(d.getDate() + 7);
    else d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  }

  function goToToday() {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  }

  function handleSelectDate(date: Date) {
    setSelectedDate(date);
    setCurrentDate(new Date(date));
  }

  // ── Header text ──────────────────────────────────────────────────────────

  const headerText =
    view === "month"
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

  // The calendar has no real event data wired up yet (static UI scaffolding
  // — no backend model, confirmed no events exist anywhere in this
  // component tree) — say so honestly rather than letting the model assume
  // or invent a schedule if asked about it.
  useSetPageContext(
    {
      page: "calendar",
      label: "Calendar",
      summary: `The student is viewing their calendar in ${view} view. No real event/schedule data is wired up on this page yet — don't assume or invent any events.`,
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
    <section className="min-h-screen bg-bg-main px-8 py-8 text-text-main">
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

          <div className="flex items-center gap-3">
            <button
              type="button"
              className="
                inline-flex items-center gap-2 rounded-lg
                border border-border-light bg-bg-container
                px-4 py-2 text-sm font-medium text-text-main
                shadow-sm transition hover:bg-bg-warm" >

              <Filter size={15} strokeWidth={1.8} />
              Filter
            </button>
            <button
              type="button"
              onClick={() => setShowAddEvent(true)}
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
                  onClick={goToPrev}
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
                  onClick={goToNext}
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
                onClick={() => setView("month")}
                className={`${getViewButtonClass("month")} border-r border-border-light`}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setView("week")}
                className={`${getViewButtonClass("week")} border-r border-border-light`}
              >
                Weekly
              </button>
              <button
                type="button"
                onClick={() => setView("day")}
                className={getViewButtonClass("day")}
              >
                Daily
              </button>
            </div>
          </div>

          {/* ── Loading state ── */}
          {status === "loading" && (
            <p className="py-12 text-center text-sm text-text-muted">
              Loading calendar...
            </p>
          )}

          {/* ── Disconnected — show local events + connect prompt ── */}
          {status === "disconnected" && (
            <>
              {view === "month" && (
                <MonthView
                  events={localEvents}
                  currentYear={currentDate.getFullYear()}
                  currentMonth={currentDate.getMonth()}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                />
              )}
              {view === "week" && (
                <WeekView
                  events={localEvents}
                  selectedDate={selectedDate}
                  onSelectDate={handleSelectDate}
                />
              )}
              {view === "day" && (
                <DayView events={localEvents} selectedDate={selectedDate} />
              )}
              <div className="mt-6">
                <GoogleCalendarConnect onConnected={refresh} />
              </div>
            </>
          )}

          {/* ── Connected — show real calendar ──
              Only a genuinely empty first load (no cached/prior data at
              all) blocks on a loading message — every subsequent
              navigation (prev/next, view switch) keeps the grid mounted
              and showing whatever's already known while it revalidates in
              the background, instead of wiping the view on every fetch. */}
          {status === "connected" && (
            <>
              {eventsLoading && allEvents.length === 0 ? (
                <p className="py-12 text-center text-sm text-text-muted">
                  Loading events...
                </p>
              ) : (
                <>
                  {eventsError && (
                    <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                      {eventsError}
                    </div>
                  )}
                  {view === "month" && (
                    <MonthView
                      events={allEvents}
                      currentYear={currentDate.getFullYear()}
                      currentMonth={currentDate.getMonth()}
                      selectedDate={selectedDate}
                      onSelectDate={handleSelectDate}
                    />
                  )}
                  {view === "week" && (
                    <WeekView
                      events={allEvents}
                      selectedDate={selectedDate}
                      onSelectDate={handleSelectDate}
                    />
                  )}
                  {view === "day" && (
                    <DayView events={allEvents} selectedDate={selectedDate} />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      <AddEventModal
        isOpen={showAddEvent}
        onClose={() => setShowAddEvent(false)}
        onEventAdded={() => {
          refetchLocal();
        }}
      />
    </section>
  );
}
