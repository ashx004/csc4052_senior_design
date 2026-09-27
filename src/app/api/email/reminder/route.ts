import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/src/library/firebaseAdmin";
import { sendEmail } from "@/src/library/email/resend";
import { dueReminderTemplate } from "@/src/library/email/templates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const WORK_BATCH_SIZE = 50;
const MAX_ATTEMPTS = 3;
const LEASE_MS = 15 * 60_000;
const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000];

type ReminderJob = {
  userId?: unknown;
  eventId?: unknown;
  eventTitle?: unknown;
  className?: unknown;
  dueAt?: unknown;
  readyAt?: unknown;
  offsetMinutes?: unknown;
  idempotencyKey?: unknown;
  status?: unknown;
  attempts?: unknown;
};

type ClaimedJob = {
  ref: DocumentReference;
  data: ReminderJob;
  uid: string;
  attempt: number;
};

function sameSecret(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
}

function authorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization");
  return sameSecret(header?.startsWith("Bearer ") ? header.slice(7) : null, secret);
}

function timestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function jobUid(ref: DocumentReference, value: unknown): string | null {
  const storedUid = stringValue(value);
  if (storedUid) return storedUid;
  const parts = ref.path.split("/");
  return parts[0] === "users" && parts[2] === "emailReminderJobs" ? parts[1] : null;
}

function leadTimeLabel(offsetMinutes: number): string {
  if (offsetMinutes % 1_440 === 0) {
    const days = offsetMinutes / 1_440;
    return `${days} ${days === 1 ? "day" : "days"} before`;
  }
  if (offsetMinutes % 60 === 0) {
    const hours = offsetMinutes / 60;
    return `${hours} ${hours === 1 ? "hour" : "hours"} before`;
  }
  return `${offsetMinutes} minutes before`;
}

function dueAtLabel(dueAt: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone,
    }).format(dueAt);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(dueAt);
  }
}

function calendarUrl(): string | null {
  const appBaseUrl = process.env.APP_BASE_URL;
  if (!appBaseUrl) return null;
  try {
    return new URL("/calendar", appBaseUrl).toString();
  } catch {
    return null;
  }
}

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown email delivery error";
  return message.slice(0, 1_000);
}

async function releaseExpiredClaims(now: Date): Promise<number> {
  const expired = await adminDb.collectionGroup("emailReminderJobs")
    .where("status", "==", "sending")
    .where("leaseExpiresAt", "<=", Timestamp.fromDate(now))
    .limit(WORK_BATCH_SIZE)
    .get();

  await Promise.all(expired.docs.map(async (snapshot) => {
    await adminDb.runTransaction(async (transaction) => {
      const current = await transaction.get(snapshot.ref);
      if (!current.exists || current.get("status") !== "sending") return;
      const leaseExpiresAt = timestamp(current.get("leaseExpiresAt"));
      if (!leaseExpiresAt || leaseExpiresAt.toDate() > now) return;
      transaction.update(snapshot.ref, {
        status: "pending",
        readyAt: Timestamp.fromDate(now),
        lastError: "Delivery lease expired before the worker completed.",
        updatedAt: FieldValue.serverTimestamp(),
      });
    });
  }));

  return expired.size;
}

async function claimJob(ref: DocumentReference, now: Date): Promise<ClaimedJob | null> {
  return adminDb.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists) return null;

    const data = snapshot.data() as ReminderJob;
    if (data.status !== "pending") return null;
    const readyAt = timestamp(data.readyAt);
    const dueAt = timestamp(data.dueAt);
    const uid = jobUid(ref, data.userId);
    if (!readyAt || !dueAt || !uid || readyAt.toDate() > now) return null;

    if (dueAt.toDate() <= now) {
      transaction.update(ref, {
        status: "skipped",
        skipReason: "deadline-passed-before-delivery",
        skippedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return null;
    }

    const previousAttempts = numberValue(data.attempts) ?? 0;
    if (previousAttempts >= MAX_ATTEMPTS) {
      transaction.update(ref, {
        status: "failed",
        failureReason: "maximum-delivery-attempts-reached",
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return null;
    }

    const attempt = previousAttempts + 1;
    transaction.update(ref, {
      status: "sending",
      attempts: attempt,
      leaseExpiresAt: Timestamp.fromDate(new Date(now.getTime() + LEASE_MS)),
      lastAttemptAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { ref, data, uid, attempt };
  });
}

async function markSkipped(job: ClaimedJob, reason: string): Promise<void> {
  await job.ref.update({
    status: "skipped",
    skipReason: reason,
    skippedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function deliverJob(job: ClaimedJob, now: Date): Promise<"sent" | "skipped" | "failed"> {
  try {
    const eventId = stringValue(job.data.eventId);
    const [preferenceSnapshot, userRecord, eventSnapshot] = await Promise.all([
      adminDb.doc(`users/${job.uid}/settings/emailReminders`).get(),
      adminAuth.getUser(job.uid),
      eventId ? adminDb.doc(`users/${job.uid}/events/${eventId}`).get() : Promise.resolve(null),
    ]);

    // Missing preferences mean disabled: existing users never receive new
    // email simply because the feature was deployed.
    if (preferenceSnapshot.get("enabled") !== true) {
      await markSkipped(job, "email-reminders-disabled");
      return "skipped";
    }
    if (!userRecord.email || !userRecord.emailVerified) {
      await markSkipped(job, "email-address-not-verified");
      return "skipped";
    }

    const dueAt = timestamp(job.data.dueAt);
    const title = stringValue(job.data.eventTitle);
    const offsetMinutes = numberValue(job.data.offsetMinutes);
    const idempotencyKey = stringValue(job.data.idempotencyKey);
    if (!dueAt || !title || !offsetMinutes || !idempotencyKey) {
      await markSkipped(job, "invalid-reminder-job-data");
      return "skipped";
    }
    const eventDueAt = eventSnapshot?.get("dueAt");
    if (!eventSnapshot?.exists || typeof eventDueAt !== "string" || new Date(eventDueAt).getTime() !== dueAt.toMillis()) {
      await markSkipped(job, "event-deleted-or-rescheduled");
      return "skipped";
    }

    const configuredTimeZone = preferenceSnapshot.get("timeZone");
    const timeZone = typeof configuredTimeZone === "string" ? configuredTimeZone : "UTC";
    const template = dueReminderTemplate({
      assignmentTitle: title,
      courseName: stringValue(job.data.className),
      recipientName: userRecord.displayName,
      dueAtLabel: dueAtLabel(dueAt.toDate(), timeZone),
      leadTimeLabel: leadTimeLabel(offsetMinutes),
      calendarUrl: calendarUrl(),
    });
    const response = await sendEmail({
      to: userRecord.email,
      subject: template.subject,
      html: template.html,
      text: template.text,
      idempotencyKey,
    });

    await job.ref.update({
      status: "sent",
      resendMessageId: response?.id ?? null,
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (error) {
    const lastError = errorMessage(error);
    if (job.attempt >= MAX_ATTEMPTS) {
      await job.ref.update({
        status: "failed",
        failureReason: lastError,
        failedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return "failed";
    }

    const retryDelay = RETRY_DELAYS_MS[Math.min(job.attempt - 1, RETRY_DELAYS_MS.length - 1)];
    await job.ref.update({
      status: "pending",
      readyAt: Timestamp.fromDate(new Date(now.getTime() + retryDelay)),
      lastError,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "failed";
  }
}

async function runReminderWorker() {
  const now = new Date();
  const reclaimed = await releaseExpiredClaims(now);
  const candidates = await adminDb.collectionGroup("emailReminderJobs")
    .where("status", "==", "pending")
    .where("readyAt", "<=", Timestamp.fromDate(now))
    .orderBy("readyAt", "asc")
    .limit(WORK_BATCH_SIZE)
    .get();

  let sent = 0;
  let skipped = 0;
  let failed = 0;
  for (const candidate of candidates.docs) {
    const job = await claimJob(candidate.ref, now);
    if (!job) continue;
    const result = await deliverJob(job, now);
    if (result === "sent") sent += 1;
    else if (result === "skipped") skipped += 1;
    else failed += 1;
  }

  return { reclaimed, inspected: candidates.size, sent, skipped, failed };
}

async function handler(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    console.error("[email/reminder] CRON_SECRET is not configured");
    return NextResponse.json({ error: "Reminder worker is not configured." }, { status: 503 });
  }
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await runReminderWorker());
  } catch (error) {
    console.error("[email/reminder] worker failed:", error);
    return NextResponse.json({ error: "Reminder worker failed." }, { status: 500 });
  }
}

// Vercel Cron invokes GET. POST is useful for protected manual testing.
export const GET = handler;
export const POST = handler;
