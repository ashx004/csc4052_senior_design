"use client";

import { FormEvent, useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/library/firebase";
import { CLASS_MEETING_DAYS, type ClassMeetingDay, type ClassMeetingException } from "@/src/library/classSchedule";

const MEETING_DAY_LABELS: Record<ClassMeetingDay, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

type ScheduleValues = {
  className: string;
  classSchedule: string;
  classRoom: string;
  meetingDays: ClassMeetingDay[];
  meetingStartTime: string;
  meetingEndTime: string;
  meetingTimeZone: string;
  termStartDate: string;
  termEndDate: string;
  meetingReminderMinutes: string;
  meetingExceptions: ClassMeetingException[];
};

const createEmptyValues = (): ScheduleValues => ({
  className: "",
  classSchedule: "",
  classRoom: "",
  meetingDays: [],
  meetingStartTime: "",
  meetingEndTime: "",
  meetingTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  termStartDate: "",
  termEndDate: "",
  meetingReminderMinutes: "0",
  meetingExceptions: [],
});

const isMeetingDay = (value: unknown): value is ClassMeetingDay =>
  typeof value === "string" && CLASS_MEETING_DAYS.includes(value as ClassMeetingDay);

function readExceptions(value: unknown): ClassMeetingException[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof (item as { date?: unknown }).date !== "string") return [];
    const source = item as Record<string, unknown>;
    return [{
      date: source.date as string,
      ...(source.cancelled === true ? { cancelled: true } : {}),
      ...(typeof source.startTime === "string" ? { startTime: source.startTime } : {}),
      ...(typeof source.endTime === "string" ? { endTime: source.endTime } : {}),
      ...(typeof source.room === "string" ? { room: source.room } : {}),
    }];
  });
}

interface EditClassScheduleModalProps {
  classId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Updates the enrollment fields used to derive recurring class calendar events. */
export default function EditClassScheduleModal({ classId, onClose, onSaved }: EditClassScheduleModalProps) {
  const { user } = useAuth();
  const [values, setValues] = useState<ScheduleValues>(createEmptyValues);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    getDoc(doc(db, "users", user.uid, "enrollment", classId))
      .then((snapshot) => {
        if (!snapshot.exists()) throw new Error("This class is no longer available.");
        if (cancelled) return;

        const data = snapshot.data();
        setValues({
          className: typeof data.className === "string" ? data.className : "this class",
          classSchedule: typeof data.classSchedule === "string" ? data.classSchedule : "",
          classRoom: typeof data.classRoom === "string" ? data.classRoom : "",
          meetingDays: Array.isArray(data.meetingDays) ? data.meetingDays.filter(isMeetingDay) : [],
          meetingStartTime: typeof data.meetingStartTime === "string" ? data.meetingStartTime : "",
          meetingEndTime: typeof data.meetingEndTime === "string" ? data.meetingEndTime : "",
          meetingTimeZone: typeof data.meetingTimeZone === "string" && data.meetingTimeZone
            ? data.meetingTimeZone
            : Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          termStartDate: typeof data.termStartDate === "string" ? data.termStartDate : "",
          termEndDate: typeof data.termEndDate === "string" ? data.termEndDate : "",
          meetingReminderMinutes: String(Math.max(0, Number(data.meetingReminderMinutes) || 0)),
          meetingExceptions: readExceptions(data.meetingExceptions),
        });
      })
      .catch((loadError: unknown) => {
        if (!cancelled) {
          console.error("Unable to load class schedule:", loadError);
          setError(loadError instanceof Error ? loadError.message : "Unable to load this class schedule.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [classId, user]);

  const setValue = <Key extends keyof ScheduleValues>(key: Key, value: ScheduleValues[Key]) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const toggleDay = (day: ClassMeetingDay) => {
    setValue("meetingDays", values.meetingDays.includes(day)
      ? values.meetingDays.filter((item) => item !== day)
      : [...values.meetingDays, day]);
  };

  const updateException = (index: number, update: Partial<ClassMeetingException>) => {
    setValue("meetingExceptions", values.meetingExceptions.map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...update } : item
    ));
  };

  const addException = () => {
    const defaultDate = values.termStartDate || new Date().toISOString().slice(0, 10);
    setValue("meetingExceptions", [...values.meetingExceptions, { date: defaultDate }]);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user) return setError("You must be logged in to change a class schedule.");

    const hasMeetingDetails = values.meetingDays.length > 0 || values.meetingStartTime || values.meetingEndTime;
    if (hasMeetingDetails && (!values.meetingDays.length || !values.meetingStartTime || !values.meetingEndTime)) {
      return setError("Choose at least one meeting day plus both a start and end time.");
    }
    if (values.meetingStartTime && values.meetingEndTime && values.meetingEndTime <= values.meetingStartTime) {
      return setError("Class meeting end time must be after the start time.");
    }
    if (values.termStartDate && values.termEndDate && values.termEndDate < values.termStartDate) {
      return setError("Term end date must be after the term start date.");
    }
    const dates = new Set<string>();
    for (const exception of values.meetingExceptions) {
      if (!exception.date) return setError("Each class exception needs a date.");
      if (dates.has(exception.date)) return setError("Use only one exception for each date.");
      dates.add(exception.date);
      if (!exception.cancelled && Boolean(exception.startTime) !== Boolean(exception.endTime)) {
        return setError("An exception time needs both a start and end time.");
      }
      if (exception.startTime && exception.endTime && exception.endTime <= exception.startTime) {
        return setError("An exception end time must be after its start time.");
      }
    }

    setSaving(true);
    setError(null);
    try {
      const reminderMinutes = Math.max(0, Number(values.meetingReminderMinutes) || 0);
      if (reminderMinutes > 0 && typeof Notification !== "undefined" && Notification.permission === "default") {
        void Notification.requestPermission();
      }
      await updateDoc(doc(db, "users", user.uid, "enrollment", classId), {
        classSchedule: values.classSchedule.trim(),
        classRoom: values.classRoom.trim(),
        meetingDays: values.meetingDays,
        meetingStartTime: values.meetingStartTime,
        meetingEndTime: values.meetingEndTime,
        meetingTimeZone: values.meetingTimeZone.trim(),
        termStartDate: values.termStartDate,
        termEndDate: values.termEndDate,
        meetingReminderMinutes: reminderMinutes,
        meetingExceptions: values.meetingExceptions.map((exception) => ({
          date: exception.date,
          ...(exception.cancelled ? { cancelled: true } : {}),
          ...(!exception.cancelled && exception.startTime ? { startTime: exception.startTime } : {}),
          ...(!exception.cancelled && exception.endTime ? { endTime: exception.endTime } : {}),
          ...(!exception.cancelled && exception.room?.trim() ? { room: exception.room.trim() } : {}),
        })),
      });
      onSaved();
      onClose();
    } catch (saveError) {
      console.error("Unable to save class schedule:", saveError);
      setError("Unable to save the class schedule. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4 backdrop-blur-sm">
      <form onSubmit={handleSubmit} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-bg-container p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-text-main">Edit class schedule</h2>
            {!loading && <p className="mt-1 text-sm text-text-muted">{values.className}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-sm text-text-muted hover:text-text-main" aria-label="Close schedule editor">Close</button>
        </div>

        {loading ? <p className="py-10 text-center text-sm text-text-muted">Loading schedule...</p> : (
          <div className="mt-5 space-y-5">
            {error && <p role="alert" className="rounded-md bg-alert-error/10 px-3 py-2 text-sm text-alert-error">{error}</p>}

            <label className="block text-sm font-medium text-text-main">Schedule note
              <input type="text" value={values.classSchedule} onChange={(event) => setValue("classSchedule", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main" placeholder="e.g. Mon / Wed" />
              <span className="mt-1 block text-xs font-normal text-text-muted">Optional display note; the fields below create calendar meetings.</span>
            </label>

            <div>
              <p className="text-sm font-medium text-text-main">Meeting days</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {CLASS_MEETING_DAYS.map((day) => {
                  const selected = values.meetingDays.includes(day);
                  return <button key={day} type="button" onClick={() => toggleDay(day)} className={`rounded-md border px-2.5 py-1.5 text-xs font-medium ${selected ? "border-primary bg-bg-warm text-primary" : "border-border-light text-text-muted hover:bg-bg-warm"}`} aria-pressed={selected}>{MEETING_DAY_LABELS[day]}</button>;
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block text-sm font-medium text-text-main">Start time<input type="time" value={values.meetingStartTime} onChange={(event) => setValue("meetingStartTime", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label>
              <label className="block text-sm font-medium text-text-main">End time<input type="time" value={values.meetingEndTime} onChange={(event) => setValue("meetingEndTime", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label>
              <label className="block text-sm font-medium text-text-main">Time zone<input type="text" value={values.meetingTimeZone} onChange={(event) => setValue("meetingTimeZone", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" placeholder="America/Chicago" /></label>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block text-sm font-medium text-text-main">Term starts<input type="date" value={values.termStartDate} onChange={(event) => setValue("termStartDate", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label>
              <label className="block text-sm font-medium text-text-main">Term ends<input type="date" value={values.termEndDate} onChange={(event) => setValue("termEndDate", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label>
            </div>

            <label className="block text-sm font-medium text-text-main">Room / location
              <input type="text" value={values.classRoom} onChange={(event) => setValue("classRoom", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main" placeholder="e.g. Bogard Hall 101" />
            </label>

            <label className="block text-sm font-medium text-text-main">Class reminder
              <select value={values.meetingReminderMinutes} onChange={(event) => setValue("meetingReminderMinutes", event.target.value)} className="mt-1 w-full rounded-md border border-border-light bg-bg-container px-3 py-2 text-sm text-text-main">
                <option value="0">No reminder</option>
                <option value="10">10 minutes before</option>
                <option value="30">30 minutes before</option>
                <option value="60">1 hour before</option>
                <option value="1440">1 day before</option>
              </select>
              <span className="mt-1 block text-xs font-normal text-text-muted">Browser notifications work while the Calendar page is open.</span>
            </label>

            <div className="border-t border-border-light pt-5">
              <div className="flex items-center justify-between gap-3">
                <div><p className="text-sm font-medium text-text-main">One-time changes</p><p className="mt-1 text-xs text-text-muted">Cancel a meeting or change its time and room for one date.</p></div>
                <button type="button" onClick={addException} className="rounded-md border border-border-light px-3 py-1.5 text-xs font-medium text-text-main hover:bg-bg-warm">Add date</button>
              </div>
              <div className="mt-3 space-y-3">
                {values.meetingExceptions.map((exception, index) => (
                  <div key={`${exception.date}-${index}`} className="rounded-md border border-border-light p-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-xs font-medium text-text-main">Date<input type="date" value={exception.date} onChange={(event) => updateException(index, { date: event.target.value })} className="mt-1 block rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label>
                      <div className="flex items-center gap-3"><label className="flex items-center gap-1.5 text-xs text-text-main"><input type="checkbox" checked={Boolean(exception.cancelled)} onChange={(event) => updateException(index, { cancelled: event.target.checked })} /> Cancel meeting</label><button type="button" onClick={() => setValue("meetingExceptions", values.meetingExceptions.filter((_, itemIndex) => itemIndex !== index))} className="text-xs font-medium text-alert-error hover:underline">Remove</button></div>
                    </div>
                    {!exception.cancelled && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3"><label className="text-xs text-text-muted">Start override<input type="time" value={exception.startTime || ""} onChange={(event) => updateException(index, { startTime: event.target.value || undefined })} className="mt-1 block w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label><label className="text-xs text-text-muted">End override<input type="time" value={exception.endTime || ""} onChange={(event) => updateException(index, { endTime: event.target.value || undefined })} className="mt-1 block w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label><label className="text-xs text-text-muted">Room override<input type="text" value={exception.room || ""} onChange={(event) => updateException(index, { room: event.target.value || undefined })} className="mt-1 block w-full rounded-md border border-border-light bg-bg-container px-2 py-1.5 text-sm text-text-main" /></label></div>}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-1">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-border-light px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-warm disabled:opacity-60">Cancel</button>
              <button type="submit" disabled={saving} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover disabled:opacity-60">{saving ? "Saving..." : "Save schedule"}</button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
