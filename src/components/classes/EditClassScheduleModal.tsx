"use client";

import { FormEvent, useEffect, useState } from "react";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import { db } from "@/src/library/firebase";
import { CLASS_MEETING_DAYS, type ClassMeetingDay } from "@/src/library/classSchedule";

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
});

const isMeetingDay = (value: unknown): value is ClassMeetingDay =>
  typeof value === "string" && CLASS_MEETING_DAYS.includes(value as ClassMeetingDay);

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

    setSaving(true);
    setError(null);
    try {
      await updateDoc(doc(db, "users", user.uid, "enrollment", classId), {
        classSchedule: values.classSchedule.trim(),
        classRoom: values.classRoom.trim(),
        meetingDays: values.meetingDays,
        meetingStartTime: values.meetingStartTime,
        meetingEndTime: values.meetingEndTime,
        meetingTimeZone: values.meetingTimeZone.trim(),
        termStartDate: values.termStartDate,
        termEndDate: values.termEndDate,
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
