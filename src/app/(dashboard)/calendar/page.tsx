"use client";

import { useState } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
} from "lucide-react";

import DayView from "@/src/components/calendar/DayView";
import MonthView from "@/src/components/calendar/MonthView";
import WeekView from "@/src/components/calendar/WeekView";

import type { CalendarView } from "@/src/components/calendar/calendarTypes";

export default function CalendarPage() {
  const [view, setView] = useState<CalendarView>("month");

  function getViewButtonClass(buttonView: CalendarView) {
    const isActive = view === buttonView;

    return `px-4 py-2 text-sm font-medium transition ${
      isActive
        ? "bg-primary text-white"
        : "text-text-main hover:bg-bg-warm"
    }`;
  }

  return (
    <section className="min-h-screen bg-bg-main px-8 py-8 text-text-main">
      <div className="mx-auto max-w-7xl">
        <header className="mb-7 flex items-start justify-between gap-6">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs text-text-muted">
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
              className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-white px-4 py-2 text-sm font-medium text-text-main shadow-sm transition hover:bg-bg-warm"
            >
              <Filter size={15} strokeWidth={1.8} />
              Filter
            </button>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
            >
              <Plus size={16} strokeWidth={2} />
              Add Event
            </button>
          </div>
        </header>

        <div className="rounded-3xl border border-border-light bg-bg-container p-6 shadow-sm">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border-light pb-4">
            <div className="flex items-center gap-8">
              <h2 className="text-xl font-semibold text-text-main">
                September 2026
              </h2>

              <div className="flex items-center overflow-hidden rounded-lg border border-border-light bg-white">
                <button
                  type="button"
                  className="flex h-9 w-10 items-center justify-center border-r border-border-light text-text-muted transition hover:bg-bg-warm"
                  aria-label="Previous"
                >
                  <ChevronLeft size={17} strokeWidth={2} />
                </button>

                <button
                  type="button"
                  className="h-9 px-4 text-sm font-medium text-text-main transition hover:bg-bg-warm"
                >
                  Today
                </button>

                <button
                  type="button"
                  className="flex h-9 w-10 items-center justify-center border-l border-border-light text-text-muted transition hover:bg-bg-warm"
                  aria-label="Next"
                >
                  <ChevronRight size={17} strokeWidth={2} />
                </button>
              </div>
            </div>

            <div className="flex overflow-hidden rounded-lg border border-border-light bg-white">
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

          {view === "month" && <MonthView />}
          {view === "week" && <WeekView />}
          {view === "day" && <DayView />}
        </div>
      </div>
    </section>
  );
}