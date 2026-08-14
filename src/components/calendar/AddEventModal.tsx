"use client";

import { useState, FormEvent, ChangeEvent } from "react";
import { useAuth } from "@/src/context/AuthContext";
import { addDoc, collection } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import type { EventTone } from "@/src/components/calendar/calendarTypes";

const TONE_OPTIONS: EventTone[] = ["cream", "sage", "rose", "lavender", "brown", "blue"];

const TONE_SWATCH_CLASSES: Record<EventTone, string> = {
  cream: "bg-[#f3dfc0]",
  sage: "bg-[#eef0d8]",
  rose: "bg-[#ead7dc]",
  lavender: "bg-[#eee3f2]",
  brown: "bg-[#d8b99a]",
  blue: "bg-[#4256d6]",
};

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onEventAdded?: () => void;
}

export default function AddEventModal({ isOpen, onClose, onEventAdded }: AddEventModalProps) {
  const { user } = useAuth();

  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endDate, setEndDate] = useState("");
  const [endTime, setEndTime] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [tone, setTone] = useState<EventTone>("cream");

  function resetForm() {
    setTitle("");
    setStartDate("");
    setStartTime("");
    setEndDate("");
    setEndTime("");
    setAllDay(false);
    setLocation("");
    setDescription("");
    setTone("cream");
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  function toISOString(dateStr: string, timeStr?: string): string {
    if (timeStr) {
      return new Date(`${dateStr}T${timeStr}`).toISOString();
    }
    return new Date(`${dateStr}T00:00:00`).toISOString();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();

    if (!user) {
      alert("You must be logged in to add an event.");
      return;
    }

    if (!title.trim()) {
      alert("Title is required!");
      return;
    }

    if (!startDate) {
      alert("Start date is required!");
      return;
    }

    if (!allDay && !endDate) {
      alert("End date is required!");
      return;
    }

    const startISO = toISOString(startDate, allDay ? undefined : startTime);
    const endISO = allDay
      ? toISOString(startDate, undefined).replace("T00:00:00", "T23:59:59")
      : toISOString(endDate, endTime);

    if (new Date(endISO) <= new Date(startISO)) {
      alert("End time must be after start time!");
      return;
    }

    const eventData = {
      title: title.trim(),
      startTime: startISO,
      endTime: endISO,
      allDay,
      location: location.trim() || null,
      description: description.trim() || null,
      tone,
      source: "local" as const,
    };

    try {
      const eventsRef = collection(db, "users", user.uid, "events");
      await addDoc(eventsRef, eventData);
      onEventAdded?.();
    } catch (error) {
      console.error("Error adding event:", error);
      alert("Failed to add event. Please try again.");
      return;
    }

    handleClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-lg bg-bg-container p-6 shadow-xl transition-all max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b pb-3 mb-4">
          <h3 className="text-xl font-semibold text-text-main">Add New Event</h3>
          <button onClick={handleClose} className="text-text-muted hover:text-text-main">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="border-b pb-2">
            <span className="text-xs font-bold uppercase text-red-500">Required *</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted">Title *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="e.g. Team Meeting"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-text-muted">All Day</label>
            <button
              type="button"
              onClick={() => setAllDay(!allDay)}
              className={`relative h-6 w-11 rounded-full transition-colors ${
                allDay ? "bg-primary" : "bg-border-hover"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-bg-container shadow transition-transform ${
                  allDay ? "translate-x-5" : ""
                }`}
              />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-text-muted">Start Date *</label>
              <input
                type="date"
                required
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            {!allDay && (
              <div>
                <label className="block text-sm font-medium text-text-muted">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            )}
            {!allDay && (
              <>
                <div>
                  <label className="block text-sm font-medium text-text-muted">End Date *</label>
                  <input
                    type="date"
                    required
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-text-muted">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none"
                  />
                </div>
              </>
            )}
          </div>

          <div className="border-b pb-2 pt-2">
            <span className="text-xs font-bold uppercase text-text-muted">Optional</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted">Location</label>
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none"
              placeholder="e.g. Conference Room B"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-border-light px-3 py-2 text-sm focus:border-primary focus:outline-none resize-none"
              placeholder="Any notes about this event..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-2">Color</label>
            <div className="flex gap-2">
              {TONE_OPTIONS.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTone(t)}
                  className={`h-7 w-7 rounded-full ${TONE_SWATCH_CLASSES[t]} ${
                    tone === t ? "ring-2 ring-primary ring-offset-1" : ""
                  }`}
                />
              ))}
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3 border-t pt-4">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-md border border-border-light px-4 py-2 text-sm font-medium text-text-muted hover:bg-bg-warm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-primary-hover shadow-sm"
            >
              Save Event
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
