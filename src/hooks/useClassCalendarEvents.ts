"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/src/context/AuthContext";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";
import { db } from "@/src/library/firebase";
import { dateKey } from "@/src/library/calendarHelpers";
import { getEnrollmentStatus } from "@/src/library/enrollmentStatus";
import type { ClassMeetingDay, ClassMeetingException, StructuredClassSchedule } from "@/src/library/classSchedule";

type ClassEnrollment = StructuredClassSchedule & {
  className?: string;
  classCode?: string;
  classRoom?: string;
  color?: string;
  status?: string;
};

type ScheduledClass = ClassEnrollment & { id: string };

const DAY_BY_INDEX: ClassMeetingDay[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

function zonedDateTime(date: Date, time: string, timeZone: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const desired = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const toUtcFromParts = (value: Date) => {
    const parts = Object.fromEntries(formatter.formatToParts(value)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]));
    return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
  };
  // Converting the formatted wall-clock parts back to UTC yields the offset.
  // A second pass handles the daylight-saving boundary around the occurrence.
  let instant = new Date(desired + (desired - toUtcFromParts(new Date(desired))));
  instant = new Date(instant.getTime() + (desired - toUtcFromParts(instant)));
  return instant;
}

function eventForMeeting(enrollment: ScheduledClass, date: Date, exception?: ClassMeetingException): CalendarEvent | null {
  const startTime = exception?.startTime || enrollment.meetingStartTime;
  const endTime = exception?.endTime || enrollment.meetingEndTime;
  if (!startTime || !endTime || endTime <= startTime) return null;
  const timeZone = enrollment.meetingTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    const start = zonedDateTime(date, startTime, timeZone);
    const end = zonedDateTime(date, endTime, timeZone);
    return {
      id: `class:${enrollment.id}:meeting:${dateKey(date)}`,
      title: [enrollment.classCode, enrollment.className].filter(Boolean).join(" - ") || "Class meeting",
      location: exception?.room || enrollment.classRoom || undefined,
      startTime: start.toISOString(),
      endTime: end.toISOString(),
      allDay: false,
      timeZone,
      color: enrollment.color,
      source: "class",
      kind: "class",
      classId: enrollment.id,
      className: enrollment.className || enrollment.classCode || "Class",
      reminderMinutes: enrollment.meetingReminderMinutes,
      classException: Boolean(exception),
    };
  } catch (error) {
    console.error(`Couldn't generate calendar event for class ${enrollment.id}:`, error);
    return null;
  }
}

export function useClassCalendarEvents(dateRange?: { start: Date; end: Date }) {
  const { user } = useAuth();
  const [enrollments, setEnrollments] = useState<ScheduledClass[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setEnrollments([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    return onSnapshot(
      collection(db, "users", user.uid, "enrollment"),
      (snapshot) => {
        setEnrollments(snapshot.docs.map((enrollment) => ({ id: enrollment.id, ...enrollment.data() as ClassEnrollment })));
        setLoading(false);
      },
      (error) => {
        console.error("Couldn't watch class schedules:", error);
        setEnrollments([]);
        setLoading(false);
      }
    );
  }, [user?.uid]);

  const events = useMemo(() => {
    if (!dateRange) return [];
    const start = new Date(dateRange.start);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dateRange.end);
    end.setHours(0, 0, 0, 0);
    const visible: CalendarEvent[] = [];

    for (const enrollment of enrollments) {
      if (getEnrollmentStatus(enrollment) === "completed" || !enrollment.meetingDays?.length) continue;
      for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
        const dateString = dateKey(date);
        if ((enrollment.termStartDate && dateString < enrollment.termStartDate) ||
            (enrollment.termEndDate && dateString > enrollment.termEndDate) ||
            !enrollment.meetingDays.includes(DAY_BY_INDEX[date.getDay()])) continue;
        const exception = enrollment.meetingExceptions?.find((item) => item.date === dateString);
        if (exception?.cancelled) continue;
        const event = eventForMeeting(enrollment, date, exception);
        if (event) visible.push(event);
      }
    }
    return visible;
  }, [enrollments, dateRange?.start?.toISOString(), dateRange?.end?.toISOString()]);

  return { events, loading };
}
