import { collection, getDocs, query, where, type Firestore } from "firebase/firestore";
import {
  defaultEmailReminderPreferences,
  getEmailReminderPreferences,
} from "./email/reminderPreferences";
import { deleteLocalEventAndCancelReminderJobs, saveLocalEventWithReminderJobs } from "./email/reminderJobs";
import { isEmailReminderEligible, resolveEventDueAt } from "./email/reminderModel";
import type { PlannedSyllabusEvent } from "./syllabusCalendar";

// Saves a syllabus's calendar events for one course and removes the ones from
// an earlier import that are no longer wanted, so importing again (or editing
// the syllabus details) never leaves duplicates behind.

export interface SyllabusSyncResult {
  added: number;
  updated: number;
  removed: number;
}

export async function listSyllabusEventIds(db: Firestore, uid: string, courseId: string): Promise<string[]> {
  const snapshot = await getDocs(
    query(
      collection(db, "users", uid, "events"),
      where("origin", "==", "syllabus"),
      where("classId", "==", courseId)
    )
  );
  return snapshot.docs.map((d) => d.id);
}

export async function syncSyllabusEvents(
  db: Firestore,
  uid: string,
  courseId: string,
  planned: PlannedSyllabusEvent[]
): Promise<SyllabusSyncResult> {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  // A failed preference read must not stop the events from being saved.
  const preferences = await getEmailReminderPreferences(db, uid, timeZone).catch(() =>
    defaultEmailReminderPreferences(timeZone)
  );

  const existing = new Set(await listSyllabusEventIds(db, uid, courseId));
  const wanted = new Set(planned.map((event) => event.id));
  let added = 0;
  let updated = 0;

  for (const event of planned) {
    const kind = event.kind;
    const eligible = isEmailReminderEligible({ kind });
    const dueAt = eligible ? resolveEventDueAt({ kind, startTime: event.date, allDay: true }) : null;
    const emailReminderOffsets = eligible ? preferences.offsetsMinutes : [];
    await saveLocalEventWithReminderJobs({
      db,
      uid,
      eventId: event.id,
      upsert: true,
      eventData: { ...event.data, dueAt, emailReminderOffsets },
      reminderEvent: {
        title: String(event.data.title),
        kind,
        classId: String(event.data.classId),
        className: event.data.className ? String(event.data.className) : undefined,
        startTime: event.date,
        allDay: true,
        dueAt: dueAt || undefined,
        emailReminderOffsets,
      },
    });
    if (existing.has(event.id)) updated += 1;
    else added += 1;
  }

  let removed = 0;
  for (const id of existing) {
    if (wanted.has(id)) continue;
    await deleteLocalEventAndCancelReminderJobs({ db, uid, eventId: id });
    removed += 1;
  }
  return { added, updated, removed };
}

/** How many calendar events this course currently has from its syllabus. */
export async function countSyllabusEvents(db: Firestore, uid: string, courseId: string): Promise<number> {
  return (await listSyllabusEventIds(db, uid, courseId)).length;
}
