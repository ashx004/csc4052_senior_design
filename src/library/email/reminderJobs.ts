import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from "firebase/firestore";
import {
  buildPendingEmailReminders,
  resolveEventDueAt,
  type ReminderEligibleEvent,
} from "./reminderModel";

type ExistingReminderJob = {
  id: string;
  status?: string;
};

type SaveLocalEventInput = {
  db: Firestore;
  uid: string;
  eventId?: string;
  eventData: DocumentData;
  reminderEvent: Omit<ReminderEligibleEvent, "id">;
};

function jobsCollection(db: Firestore, uid: string) {
  return collection(db, "users", uid, "emailReminderJobs");
}

async function getExistingJobs(db: Firestore, uid: string, eventId: string): Promise<ExistingReminderJob[]> {
  const snapshot = await getDocs(query(jobsCollection(db, uid), where("eventId", "==", eventId)));
  return snapshot.docs.map((job) => ({
    id: job.id,
    ...(job.data() as Omit<ExistingReminderJob, "id">),
  }));
}

/**
 * Saves the local event and its reminder jobs in one batch. The event and the
 * jobs therefore cannot drift if an edit, move, or delete is interrupted.
 */
export async function saveLocalEventWithReminderJobs(input: SaveLocalEventInput): Promise<string> {
  const events = collection(input.db, "users", input.uid, "events");
  const eventRef = input.eventId ? doc(events, input.eventId) : doc(events);
  const eventId = eventRef.id;
  const existingJobs = input.eventId ? await getExistingJobs(input.db, input.uid, eventId) : [];
  const pendingJobs = buildPendingEmailReminders({ id: eventId, ...input.reminderEvent });
  const pendingJobIds = new Set(pendingJobs.map((job) => job.jobId));
  const batch = writeBatch(input.db);

  if (input.eventId) {
    batch.update(eventRef, { ...input.eventData, updatedAt: serverTimestamp() });
  } else {
    batch.set(eventRef, {
      ...input.eventData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  for (const job of existingJobs) {
    if (job.status === "pending" && !pendingJobIds.has(job.id)) {
      batch.update(doc(jobsCollection(input.db, input.uid), job.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancellationReason: "event-updated",
        updatedAt: serverTimestamp(),
      });
    }
  }

  const existingById = new Map(existingJobs.map((job) => [job.id, job]));
  for (const job of pendingJobs) {
    const existing = existingById.get(job.jobId);
    // Never turn an email that is already being sent or was sent into a new
    // pending job. This preserves delivery history and prevents duplicates.
    if (existing?.status === "sending" || existing?.status === "sent") continue;

    batch.set(doc(jobsCollection(input.db, input.uid), job.jobId), {
      userId: input.uid,
      eventId,
      eventTitle: input.reminderEvent.title,
      eventKind: input.reminderEvent.kind,
      classId: input.reminderEvent.classId ?? null,
      className: input.reminderEvent.className ?? null,
      dueAt: Timestamp.fromDate(job.dueAt),
      triggerAt: Timestamp.fromDate(job.triggerAt),
      // readyAt changes only for server retry backoff. New jobs are ready at
      // the intended trigger time.
      readyAt: Timestamp.fromDate(job.triggerAt),
      offsetMinutes: job.offsetMinutes,
      idempotencyKey: job.idempotencyKey,
      status: "pending",
      attempts: 0,
      resendMessageId: null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: existing?.status === "pending" });
  }

  await batch.commit();
  return eventId;
}

export async function deleteLocalEventAndCancelReminderJobs(input: {
  db: Firestore;
  uid: string;
  eventId: string;
}): Promise<void> {
  const existingJobs = await getExistingJobs(input.db, input.uid, input.eventId);
  const batch = writeBatch(input.db);
  batch.delete(doc(input.db, "users", input.uid, "events", input.eventId));

  for (const job of existingJobs) {
    if (job.status === "pending") {
      batch.update(doc(jobsCollection(input.db, input.uid), job.id), {
        status: "cancelled",
        cancelledAt: serverTimestamp(),
        cancellationReason: "event-deleted",
        updatedAt: serverTimestamp(),
      });
    }
  }

  await batch.commit();
}

/**
 * Applies a user's Settings offsets to every future local assignment/exam.
 * This is called after Settings saves, so changing from "1 day" to "1 hour"
 * also updates existing upcoming work instead of affecting only new events.
 */
export async function syncUpcomingReminderJobsForUser(input: {
  db: Firestore;
  uid: string;
  offsetsMinutes: number[];
}): Promise<number> {
  const events = await getDocs(collection(input.db, "users", input.uid, "events"));
  let synced = 0;

  for (const eventSnapshot of events.docs) {
    const event = eventSnapshot.data();
    if (!isReminderEventData(event)) continue;

    const dueAt = resolveEventDueAt({
      kind: event.kind,
      startTime: event.startTime,
      allDay: event.allDay,
      dueAt: typeof event.dueAt === "string" ? event.dueAt : undefined,
    });
    if (!dueAt || new Date(dueAt).getTime() <= Date.now()) continue;

    await saveLocalEventWithReminderJobs({
      db: input.db,
      uid: input.uid,
      eventId: eventSnapshot.id,
      eventData: {
        dueAt,
        emailReminderOffsets: input.offsetsMinutes,
      },
      reminderEvent: {
        title: event.title,
        kind: event.kind,
        classId: typeof event.classId === "string" ? event.classId : undefined,
        className: typeof event.className === "string" ? event.className : undefined,
        startTime: event.startTime,
        allDay: event.allDay,
        dueAt,
        emailReminderOffsets: input.offsetsMinutes,
      },
    });
    synced += 1;
  }

  return synced;
}

function isReminderEventData(event: DocumentData): event is DocumentData & {
  title: string;
  kind: "assignment" | "exam";
  startTime: string;
  allDay: boolean;
} {
  return typeof event.title === "string"
    && (event.kind === "assignment" || event.kind === "exam")
    && typeof event.startTime === "string"
    && typeof event.allDay === "boolean";
}
