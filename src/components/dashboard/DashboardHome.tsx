"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { ArrowRight, BookOpen, CalendarDays, Clock3, GraduationCap, Plus, Sparkles } from "lucide-react";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import { useStudyPlanContext } from "@/src/context/StudyPlanContext";
import { useLocalCalendarEvents } from "@/src/hooks/useLocalCalendarEvents";
import { useClassCalendarEvents } from "@/src/hooks/useClassCalendarEvents";
import { getEventsForDay } from "@/src/library/calendarHelpers";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type Enrollment = { id: string; className?: string; classCode?: string; status?: string };

function atMidnight(date = new Date()) {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dueDate(event: CalendarEvent) {
  if (!event.allDay) return new Date(event.dueAt ?? event.startTime);
  const [year, month, day] = event.startTime.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isDeadline(event: CalendarEvent) {
  return event.kind === "assignment" || event.kind === "exam" || event.category === "deadline" || event.category === "exam";
}

function timeLabel(event: CalendarEvent) {
  return event.allDay ? "All day" : new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(event.startTime));
}

function dueLabel(event: CalendarEvent, today: Date) {
  const days = Math.round((atMidnight(dueDate(event)).getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return days < 0 ? "Overdue" : "Due today";
  return days === 1 ? "Due tomorrow" : `Due in ${days} days`;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-center text-sm text-text-muted">{children}</p>;
}

export default function DashboardHome() {
  const { user } = useAuth();
  const { tasks, tasksLoading } = useStudyPlanContext();
  const [classes, setClasses] = useState<Enrollment[]>([]);
  const [classesLoading, setClassesLoading] = useState(true);
  const range = useMemo(() => {
    const start = atMidnight();
    const end = new Date(start);
    end.setDate(end.getDate() + 14);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, []);
  const { events: localEvents, loading: localLoading } = useLocalCalendarEvents(range);
  const { events: classEvents, loading: classEventsLoading } = useClassCalendarEvents(range);

  useEffect(() => {
    if (!user) { setClasses([]); setClassesLoading(false); return; }
    setClassesLoading(true);
    return onSnapshot(collection(db, "users", user.uid, "enrollment"), (snapshot) => {
      setClasses(snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() as Omit<Enrollment, "id"> })));
      setClassesLoading(false);
    }, () => { setClasses([]); setClassesLoading(false); });
  }, [user?.uid]);

  const today = atMidnight();
  const allEvents = useMemo(() => [...localEvents, ...classEvents], [localEvents, classEvents]);
  const todayEvents = useMemo(() => getEventsForDay(allEvents, today)
    .filter((event) => event.allDay || new Date(event.endTime).getTime() >= Date.now())
    .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime()).slice(0, 4), [allEvents, today]);
  const deadlines = useMemo(() => allEvents.filter((event) => isDeadline(event) && dueDate(event).getTime() >= today.getTime())
    .sort((a, b) => dueDate(a).getTime() - dueDate(b).getTime()).slice(0, 4), [allEvents, today]);
  const activeClasses = useMemo(() => classes.filter((course) => getEnrollmentStatus(course) !== "completed"), [classes]);
  const activeTasks = useMemo(() => tasks.filter((task) => ["recommended", "in_progress", "completed"].includes(task.status)), [tasks]);
  const done = activeTasks.filter((task) => task.status === "completed").length;
  const nextTask = activeTasks.find((task) => task.status === "in_progress") ?? activeTasks.find((task) => task.status === "recommended");
  const remaining = activeTasks.filter((task) => task.status !== "completed").reduce((sum, task) => sum + task.estimatedMinutes, 0);
  const progress = activeTasks.length ? Math.round((done / activeTasks.length) * 100) : 0;
  const eventsLoading = localLoading || classEventsLoading;

  return <section className="min-h-screen bg-bg-main px-4 py-8 text-text-main sm:px-8 lg:px-10" style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}><div className="mx-auto max-w-7xl" data-tutorial="dashboard-cards">
    <header className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end"><div><p className="mb-2 text-sm font-medium text-text-muted">{today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}</p><h1 className="text-3xl font-semibold tracking-tight" data-tutorial="dashboard-heading">Your home base</h1><p className="mt-2 text-sm text-text-muted">See what&apos;s ahead and pick up the most important next step.</p></div><div className="flex flex-wrap gap-3"><Link href="/calendar" className="inline-flex items-center gap-2 rounded-lg border border-border-light bg-bg-container px-4 py-2.5 text-sm font-semibold shadow-sm hover:bg-bg-warm"><Plus size={16} />Add event</Link><Link href="/learning" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-sm hover:bg-primary-hover"><Sparkles size={16} />{nextTask ? "Continue studying" : "Build a study plan"}</Link></div></header>
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold"><CalendarDays className="text-primary" size={19} />Today</h2><Link href="/calendar" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">View calendar<ArrowRight size={14} /></Link></div>{eventsLoading ? <Empty>Loading today&apos;s schedule...</Empty> : todayEvents.length === 0 ? <Empty>Nothing else scheduled today. Add an event or check your calendar.</Empty> : <ul className="mt-5 divide-y divide-border-light">{todayEvents.map((event) => <li key={event.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><span className="h-9 w-1 rounded-full bg-primary" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{event.title}</p><p className="truncate text-xs text-text-muted">{event.location ?? event.className ?? "Calendar event"}</p></div><time className="text-xs text-text-muted">{timeLabel(event)}</time></li>)}</ul>}</section>
      <section className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold"><Clock3 className="text-primary" size={19} />Upcoming deadlines</h2><Link href="/calendar" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">View calendar<ArrowRight size={14} /></Link></div>{eventsLoading ? <Empty>Loading deadlines...</Empty> : deadlines.length === 0 ? <Empty>No upcoming deadlines. Tag an event as an assignment or exam to see it here.</Empty> : <ul className="mt-5 divide-y divide-border-light">{deadlines.map((event) => <li key={event.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"><Clock3 className="shrink-0 text-primary" size={17} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{event.title}</p><p className="text-xs text-text-muted">{event.className ?? (event.kind === "exam" ? "Exam" : "Assignment")}</p></div><span className="text-xs font-semibold text-primary">{dueLabel(event, today)}</span></li>)}</ul>}</section>
      <section className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold"><BookOpen className="text-primary" size={19} />Continue learning</h2><Link href="/learning" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">Open learning<ArrowRight size={14} /></Link></div>{tasksLoading ? <Empty>Loading your study plan...</Empty> : !nextTask ? <Empty>No study task is waiting. <Link href="/learning" className="font-semibold text-primary">Create a study plan.</Link></Empty> : <div className="mt-5"><div className="rounded-xl bg-bg-warm p-4"><p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Up next · {nextTask.courseCode}</p><p className="mt-1 text-sm font-semibold">{nextTask.title}</p><p className="mt-1 text-xs text-text-muted">{nextTask.estimatedMinutes} min{nextTask.reason ? ` · ${nextTask.reason}` : ""}</p></div><div className="mt-4 flex justify-between text-xs text-text-muted"><span>{done} of {activeTasks.length} tasks complete</span><span>{remaining} min remaining</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-bg-warm"><div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} /></div></div>}</section>
      <section className="rounded-2xl border border-border-light bg-bg-container p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold"><GraduationCap className="text-primary" size={19} />Your classes</h2><Link href="/classes" className="inline-flex items-center gap-1 text-xs font-semibold text-primary">View classes<ArrowRight size={14} /></Link></div>{classesLoading ? <Empty>Loading your classes...</Empty> : activeClasses.length === 0 ? <Empty>No active classes yet. <Link href="/classes" className="font-semibold text-primary">Add a class.</Link></Empty> : <ul className="mt-5 grid gap-3 sm:grid-cols-2">{activeClasses.slice(0, 4).map((course) => <li key={course.id}><Link href={`/courses/${course.id}`} className="block rounded-xl border border-border-light p-3 hover:bg-bg-warm"><p className="truncate text-sm font-semibold">{course.classCode ?? "Course"}</p><p className="mt-0.5 truncate text-xs text-text-muted">{course.className ?? "Untitled class"}</p></Link></li>)}</ul>}</section>
    </div>
  </div></section>;
}
