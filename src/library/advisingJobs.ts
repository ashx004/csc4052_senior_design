import type { NextRequest } from "next/server";
import { adminDb } from "@/src/library/firebaseAdmin";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { studyNotificationsCollection } from "@/src/library/studyPlan/firestorePaths";
import type { AdvisingNotificationType } from "@/src/library/studyPlan/types";

// Advising work that takes longer than one request should (reading the
// transcript + curriculum, generating a schedule) runs as a background job:
// the browser gets a fast "queued" answer, /api/advising-jobs/worker does the
// work server-to-server, and the student can leave the page meanwhile. One job
// document per student per kind, keyed by uid.
export const EXTRACTION_JOBS = "advisingExtractionJobs";
export const SCHEDULE_JOBS = "advisingScheduleJobs";

// Longer than any single job should take: extraction makes up to 4
// sequential Ollama calls, each bounded by ADVISING_OLLAMA_TIMEOUT_MS.
export const JOB_LEASE_MS = 30 * 60 * 1000;

// A job nobody has picked up (or whose lease ran out) for this long is
// treated as dead, so the page falls back to its normal forms instead of
// waiting on it forever.
const STALE_AFTER_MS = 5 * 60 * 1000;

export type FirestoreDate = { toDate?: () => Date } | Date | null | undefined;

export function toDate(value: FirestoreDate): Date | null {
  if (!value) return null;
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

// Best-effort immediate pickup, same pattern as /api/embed-document - the
// dedicated worker process (npm run worker:advising) also drains any job that
// survives a server restart or a failed first attempt.
export function pingAdvisingWorker(request: NextRequest) {
  if (!process.env.INTERNAL_API_SECRET) return;
  fetch(resolveInternalUrl(request, "/api/advising-jobs/worker"), {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET },
  }).catch((error) => console.error("Failed to start advising worker:", error));
}

export async function enqueueAdvisingJob(
  request: NextRequest,
  collection: string,
  uid: string,
  extraFields: Record<string, unknown> = {}
) {
  const jobRef = adminDb.collection(collection).doc(uid);
  const existing = (await jobRef.get()).data();

  // Already in flight - don't start a second, duplicate job. Still fall
  // through to the worker ping though: claiming is transaction-protected (see
  // claimNextJob in advising-jobs/worker), so it's harmless to nudge a job
  // that's genuinely being worked on, and it's what actually rescues one
  // that's stuck (e.g. the one active attempt died without requeuing itself).
  const alreadyInFlight = existing?.status === "queued" || existing?.status === "processing";

  if (!alreadyInFlight) {
    await jobRef.set({
      userId: uid,
      status: "queued",
      attempts: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      startedAt: null,
      completedAt: null,
      failedAt: null,
      nextAttemptAt: new Date(),
      leaseExpiresAt: null,
      lastError: null,
      ...extraFields,
    });
  }

  pingAdvisingWorker(request);
}

export type AdvisingJobStatus = "none" | "queued" | "processing" | "complete" | "failed" | "stale";

// Reads a student's job for the page to poll or resume. Also nudges the
// worker when a job is due - a retry scheduled for later only runs when
// something pings the worker, and without the separate worker process nothing
// else would.
export async function readAdvisingJob(
  request: NextRequest,
  collection: string,
  uid: string
): Promise<{ status: AdvisingJobStatus; data: FirebaseFirestore.DocumentData | null }> {
  const jobDoc = await adminDb.collection(collection).doc(uid).get();
  if (!jobDoc.exists) return { status: "none", data: null };

  const data = jobDoc.data()!;
  const now = Date.now();

  if (data.status === "queued" || data.status === "processing") {
    const dueAt =
      data.status === "queued"
        ? toDate(data.nextAttemptAt)?.getTime() ?? now
        : toDate(data.leaseExpiresAt)?.getTime() ?? now;

    if (dueAt <= now) pingAdvisingWorker(request);
    if (dueAt + STALE_AFTER_MS <= now) return { status: "stale", data };
  }

  return { status: data.status as AdvisingJobStatus, data };
}

const NOTIFICATION_CONTENT: Record<AdvisingNotificationType, { title: string; body: string }> = {
  advising_documents_ready: {
    title: "Your advising documents are ready",
    body: "Your transcript and curriculum sheet have been read. Open Advising to generate your schedule.",
  },
  advising_documents_failed: {
    title: "We couldn't read your advising documents",
    body: "Open Advising to see what went wrong and try again.",
  },
  advising_schedule_ready: {
    title: "Your schedule is ready",
    body: "Your suggested schedule has been generated.",
  },
  advising_schedule_failed: {
    title: "We couldn't generate your schedule",
    body: "Open Advising to see what went wrong and try again.",
  },
};

// Written to the same collection as study-plan notifications, which
// NotificationToast listens to on every page - so the popup appears wherever
// the student is when the job finishes.
export async function notifyAdvising(uid: string, type: AdvisingNotificationType) {
  const content = NOTIFICATION_CONTENT[type];
  await adminDb.collection(studyNotificationsCollection(uid)).add({
    type,
    status: "created",
    title: content.title,
    body: content.body,
    actionUrl: "/advising_new",
    actionLabel: "View",
    createdAt: new Date(),
    deliveredAt: null,
    readAt: null,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    dedupeKey: `${type}:${Date.now()}`,
  });
}
