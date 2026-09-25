"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { addDoc, collection, deleteDoc, doc, getDocs, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { useAuth } from "@/src/context/AuthContext";
import type { CalendarEvent, EventTone } from "@/src/components/calendar/calendarTypes";

const TONE_OPTIONS: EventTone[] = ["cream", "sage", "rose", "lavender", "brown", "blue"];
const TONE_SWATCH_CLASSES: Record<EventTone, string> = {
  cream: "bg-[#f3dfc0]", sage: "bg-[#eef0d8]", rose: "bg-[#ead7dc]",
  lavender: "bg-[#eee3f2]", brown: "bg-[#d8b99a]", blue: "bg-[#4256d6]",
};
type ClassOption = { id: string; name: string };

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded?: () => void;
  event?: CalendarEvent | null;
  events?: CalendarEvent[];
}

function dateInputValue(value: string, allDay: boolean): string {
  if (!value) return "";
  if (allDay) return value.slice(0, 10);
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timeInputValue(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function nextCalendarDate(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
}

function localISOString(date: string, time: string): string {
  return new Date(`${date}T${time || "00:00"}:00`).toISOString();
}

export default function AddEventModal({ isOpen, onClose, onEventAdded, event, events = [] }: AddEventModalProps) {
  const { user } = useAuth();
  const router = useRouter();
  const isEditing = Boolean(event);
  const canEdit = !event || event.source === "local";
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("10:00");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<EventTone>("cream");
  const [kind, setKind] = useState<NonNullable<CalendarEvent["kind"]>>("event");
  const [classId, setClassId] = useState("");
  const [recurrence, setRecurrence] = useState<NonNullable<CalendarEvent["recurrence"]>>("none");
  const [recurrenceUntil, setRecurrenceUntil] = useState("");
  const [reminderMinutes, setReminderMinutes] = useState("0");
  const [error, setError] = useState<string | null>(null);
  const [conflictWarning, setConflictWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    getDocs(collection(db, "users", user.uid, "enrollment"))
      .then((snapshot) => setClasses(snapshot.docs.map((classDoc) => {
        const data = classDoc.data();
        return { id: classDoc.id, name: data.className || data.classCode || "Untitled class" };
      })))
      .catch((loadError) => console.error("Couldn't load classes for calendar event:", loadError));
  }, [user?.uid]);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setConflictWarning(null);
    if (event) {
      setTitle(event.title);
      setAllDay(event.allDay);
      setStartDate(dateInputValue(event.startTime, event.allDay));
      setStartTime(event.allDay ? "09:00" : timeInputValue(event.startTime));
      setEndDate(event.allDay ? "" : dateInputValue(event.endTime, false));
      setEndTime(event.allDay ? "10:00" : timeInputValue(event.endTime));
      setLocation(event.location || "");
      setDescription(event.description || "");
      setTone(event.tone || "cream");
      setKind(event.kind || "event");
      setClassId(event.classId || "");
      setRecurrence(event.recurrence || "none");
      setRecurrenceUntil(event.recurrenceUntil || "");
      setReminderMinutes(String(event.reminderMinutes || 0));
    } else {
      const today = new Date();
      const formattedToday = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      setTitle(""); setStartDate(formattedToday); setEndDate(formattedToday);
      setStartTime("09:00"); setEndTime("10:00"); setAllDay(false); setLocation(""); setDescription("");
      setTone("cream"); setKind("event"); setClassId(""); setRecurrence("none"); setRecurrenceUntil(""); setReminderMinutes("0");
    }
  }, [isOpen, event?.id]);

  const selectedClass = useMemo(() => classes.find((entry) => entry.id === classId), [classes, classId]);

  function close() {
    if (!saving) onClose();
  }

  function resetConflict() { setConflictWarning(null); }

  async function handleSubmit(formEvent: FormEvent) {
    formEvent.preventDefault();
    if (!user || !canEdit) return;
    if (!title.trim() || !startDate || (!allDay && !endDate)) {
      setError("Enter a title, start date, and end date.");
      return;
    }
    const startTimeValue = allDay ? startDate : localISOString(startDate, startTime);
    const endTimeValue = allDay ? nextCalendarDate(startDate) : localISOString(endDate, endTime);
    if (!allDay && new Date(endTimeValue) <= new Date(startTimeValue)) {
      setError("End time must be after start time.");
      return;
    }
    const persistedEventId = event?.seriesId ?? event?.id;
    const overlaps = events.filter((candidate) => candidate.id !== persistedEventId &&
      new Date(candidate.endTime).getTime() > new Date(startTimeValue).getTime() &&
      new Date(candidate.startTime).getTime() < new Date(endTimeValue).getTime());
    if (overlaps.length > 0 && !conflictWarning) {
      setConflictWarning(`This overlaps with ${overlaps.slice(0, 2).map((candidate) => candidate.title).join(" and ")}. Save again to keep the overlap.`);
      return;
    }

    setSaving(true); setError(null);
    const eventData = {
      title: title.trim(), startTime: startTimeValue, endTime: endTimeValue, allDay,
      timeZone: allDay ? null : Intl.DateTimeFormat().resolvedOptions().timeZone,
      location: location.trim() || null, description: description.trim() || null, tone,
      kind, classId: classId || null, className: selectedClass?.name || event?.className || null,
      recurrence, recurrenceUntil: recurrence === "none" ? null : recurrenceUntil || null,
      reminderMinutes: Math.max(0, Number(reminderMinutes) || 0),
      source: "local" as const, updatedAt: serverTimestamp(),
    };
    try {
      if (event) await updateDoc(doc(db, "users", user.uid, "events", event.seriesId ?? event.id), eventData);
      else await addDoc(collection(db, "users", user.uid, "events"), { ...eventData, createdAt: serverTimestamp() });
      onEventAdded?.();
      onClose();
    } catch (saveError) {
      console.error("Could not save calendar event:", saveError);
      setError("Could not save the event. Please try again.");
    } finally { setSaving(false); }
  }

  async function handleDelete() {
    if (!user || !event || !canEdit || !window.confirm(`Delete "${event.title}"?`)) return;
    setSaving(true);
    try {
      await deleteDoc(doc(db, "users", user.uid, "events", event.seriesId ?? event.id));
      onEventAdded?.(); onClose();
    } catch (deleteError) {
      console.error("Could not delete calendar event:", deleteError);
      setError("Could not delete the event. Please try again.");
    } finally { setSaving(false); }
  }

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm" onClick={close}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-bg-container p-6 shadow-xl" onClick={(click) => click.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between border-b border-border-light pb-3">
          <div><h3 className="text-xl font-semibold text-text-main">{isEditing ? "Edit event" : "Add event"}</h3>
            {event?.source === "google" && <p className="mt-1 text-xs text-text-muted">Google events are managed in Google Calendar.</p>}
            {event?.source === "class" && <p className="mt-1 text-xs text-text-muted">This meeting is generated from its class schedule. Update the class schedule to change it.</p>}</div>
          <button type="button" onClick={close} className="text-text-muted hover:text-text-main" aria-label="Close event editor">Close</button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          {event?.source === "class" && (
            <section className="rounded-lg border border-border-light bg-bg-main p-3 text-sm text-text-main">
              <p className="font-medium">Class meeting details</p>
              <p className="mt-1 text-text-muted">{event.location ? `Location: ${event.location}` : "No room or location has been added."}</p>
              {event.classException && <p className="mt-1 text-text-muted">This occurrence uses a one-time schedule override.</p>}
              {event.conflictTitles?.length ? <p role="alert" className="mt-2 text-alert-error">Conflicts with: {event.conflictTitles.join(", ")}</p> : null}
              {event.classId && <button type="button" onClick={() => router.push(`/classes?editSchedule=${encodeURIComponent(event.classId!)}`)} className="mt-3 rounded-md border border-border-light px-3 py-1.5 text-xs font-medium hover:bg-bg-warm">Edit class schedule</button>}
            </section>
          )}
          <label className="block text-sm font-medium text-text-muted">Title *<input required disabled={!canEdit} value={title} onChange={(change) => { setTitle(change.target.value); resetConflict(); }} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main outline-none focus:border-primary" /></label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text-muted">Type<select disabled={!canEdit} value={kind} onChange={(change) => setKind(change.target.value as NonNullable<CalendarEvent["kind"]>)} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main"><option value="event">Event</option><option value="study">Study block</option><option value="assignment">Assignment</option><option value="exam">Exam</option><option value="class">Class meeting</option></select></label>
            <label className="block text-sm font-medium text-text-muted">Class<select disabled={!canEdit} value={classId} onChange={(change) => setClassId(change.target.value)} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main"><option value="">No class</option>{classes.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-text-muted"><input type="checkbox" checked={allDay} disabled={!canEdit} onChange={(change) => { setAllDay(change.target.checked); resetConflict(); }} />All day</label>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text-muted">Start date *<input type="date" required disabled={!canEdit} value={startDate} onChange={(change) => { setStartDate(change.target.value); if (!endDate) setEndDate(change.target.value); resetConflict(); }} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>
            {!allDay && <label className="block text-sm font-medium text-text-muted">Start time<input type="time" disabled={!canEdit} value={startTime} onChange={(change) => { setStartTime(change.target.value); resetConflict(); }} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>}
            {!allDay && <label className="block text-sm font-medium text-text-muted">End date *<input type="date" required disabled={!canEdit} value={endDate} onChange={(change) => { setEndDate(change.target.value); resetConflict(); }} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>}
            {!allDay && <label className="block text-sm font-medium text-text-muted">End time<input type="time" disabled={!canEdit} value={endTime} onChange={(change) => { setEndTime(change.target.value); resetConflict(); }} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm font-medium text-text-muted">Repeat<select disabled={!canEdit} value={recurrence} onChange={(change) => setRecurrence(change.target.value as NonNullable<CalendarEvent["recurrence"]>)} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main"><option value="none">Does not repeat</option><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option></select></label>
            <label className="block text-sm font-medium text-text-muted">Reminder<select disabled={!canEdit} value={reminderMinutes} onChange={(change) => setReminderMinutes(change.target.value)} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main"><option value="0">No reminder</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label>
          </div>
          {recurrence !== "none" && <label className="block text-sm font-medium text-text-muted">Repeat until (optional)<input type="date" disabled={!canEdit} value={recurrenceUntil} onChange={(change) => setRecurrenceUntil(change.target.value)} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>}
          <label className="block text-sm font-medium text-text-muted">Location<input disabled={!canEdit} value={location} onChange={(change) => setLocation(change.target.value)} className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>
          <label className="block text-sm font-medium text-text-muted">Notes<textarea disabled={!canEdit} value={description} onChange={(change) => setDescription(change.target.value)} rows={3} className="mt-1 w-full resize-none rounded-md border border-border-light px-3 py-2 text-sm text-text-main" /></label>
          <div><p className="text-sm font-medium text-text-muted">Color</p><div className="mt-2 flex gap-2">{TONE_OPTIONS.map((option) => <button key={option} type="button" disabled={!canEdit} onClick={() => setTone(option)} aria-label={`${option} color`} className={`h-7 w-7 rounded-full ${TONE_SWATCH_CLASSES[option]} ${tone === option ? "ring-2 ring-primary ring-offset-1" : ""}`} />)}</div></div>
          {error && <p className="text-sm text-alert-error">{error}</p>}{conflictWarning && <p className="text-sm text-alert-error">{conflictWarning}</p>}
          <div className="flex justify-between gap-3 border-t border-border-light pt-4">
            {isEditing && canEdit ? <button type="button" onClick={handleDelete} disabled={saving} className="rounded-md px-3 py-2 text-sm font-medium text-alert-error hover:bg-alert-error-bg">Delete</button> : <span />}
            <div className="flex gap-3"><button type="button" onClick={close} disabled={saving} className="rounded-md border border-border-light px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-warm">Cancel</button>{canEdit && <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-50">{saving ? "Saving..." : isEditing ? "Save changes" : "Save event"}</button>}</div>
          </div>
        </form>
      </div>
    </div>
  );
}
