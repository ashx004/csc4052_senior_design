import { NextRequest, NextResponse } from "next/server";
import { Agent, fetch as undiciFetch } from "undici";
import type { DocumentData, UpdateData } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { isInternalRequest } from "@/src/library/verifyAuth";
import {
  EXTRACTION_JOBS,
  SCHEDULE_JOBS,
  JOB_LEASE_MS,
  notifyAdvising,
  toDate,
  type FirestoreDate,
} from "@/src/library/advisingJobs";
import type { AdvisingNotificationType } from "@/src/library/studyPlan/types";

// The two kinds of advising background job. Each is processed by POSTing the
// student's uid to its route with the internal secret; that route does the
// real work (with Firebase Admin) and reports back.
type JobKind = {
  collection: string;
  processPath: string;
  label: string;
  // Extra fields saved on the job when it completes, from the route's reply.
  completeFields: (result: Record<string, unknown>) => Record<string, unknown>;
  notifyReady: AdvisingNotificationType;
  notifyFailed: AdvisingNotificationType;
};

const JOB_KINDS: JobKind[] = [
  {
    collection: EXTRACTION_JOBS,
    processPath: "/api/advising/extract",
    label: "Advising extraction",
    completeFields: (result) => ({
      needsManualTransferReview: result.needsManualTransferReview ?? false,
      unreadableTransferInfo: result.unreadableTransferInfo ?? null,
    }),
    notifyReady: "advising_documents_ready",
    notifyFailed: "advising_documents_failed",
  },
  {
    collection: SCHEDULE_JOBS,
    processPath: "/api/advising/generate",
    label: "Schedule generation",
    completeFields: () => ({}),
    notifyReady: "advising_schedule_ready",
    notifyFailed: "advising_schedule_failed",
  },
];

const MAX_ATTEMPTS = 3;

// The processing route only answers once the whole job is done - up to 4
// sequential AI calls for an extraction - which runs past fetch's default
// 5-minute wait for response headers. This agent raises that to the job's
// lease for this one call only. It must NOT be installed globally with
// setGlobalDispatcher: that broke gzip decoding for every other fetch in the
// server (including login's download of Google's signing keys) - see the
// same note on ollamaAgent in advisingOllama.ts.
const processingAgent = new Agent({ headersTimeout: JOB_LEASE_MS });

type AdvisingJob = {
  userId: string;
  attempts?: number;
  nextAttemptAt?: FirestoreDate;
  leaseExpiresAt?: FirestoreDate;
};

function isReadyToRun(value: AdvisingJob["nextAttemptAt"]): boolean {
  const date = toDate(value);
  return !date || date.getTime() <= Date.now();
}

function hasExpiredLease(value: AdvisingJob["leaseExpiresAt"]): boolean {
  const date = toDate(value);
  return Boolean(date && date.getTime() <= Date.now());
}

async function claimNextJob(): Promise<{ kind: JobKind; id: string; data: AdvisingJob; attempts: number } | null> {
  for (const kind of JOB_KINDS) {
    const candidates = await adminDb
      .collection(kind.collection)
      .where("status", "in", ["queued", "processing"])
      .limit(20)
      .get();

    for (const candidate of candidates.docs) {
      const claimed = await adminDb.runTransaction(async (transaction) => {
        const fresh = await transaction.get(candidate.ref);
        if (!fresh.exists) return null;

        const data = fresh.data() as AdvisingJob;
        const status = fresh.data()?.status;
        const canClaimQueued = status === "queued" && isReadyToRun(data.nextAttemptAt);
        const canReclaimProcessing = status === "processing" && hasExpiredLease(data.leaseExpiresAt);
        if (!canClaimQueued && !canReclaimProcessing) return null;

        const attempts = (typeof data.attempts === "number" ? data.attempts : 0) + 1;
        transaction.update(candidate.ref, {
          status: "processing",
          attempts,
          startedAt: new Date(),
          leaseExpiresAt: new Date(Date.now() + JOB_LEASE_MS),
          updatedAt: new Date(),
          lastError: null,
        });
        return { id: candidate.id, data, attempts };
      });
      if (claimed) return { kind, ...claimed };
    }
  }

  return null;
}

async function updateActiveClaim(collection: string, jobId: string, fields: UpdateData<DocumentData>): Promise<boolean> {
  const jobRef = adminDb.collection(collection).doc(jobId);
  return adminDb.runTransaction(async (transaction) => {
    const fresh = await transaction.get(jobRef);
    if (!fresh.exists || fresh.data()?.status !== "processing") return false;
    transaction.update(jobRef, fields);
    return true;
  });
}

// A failure the processing route says can't be fixed by trying again (e.g.
// no transcript uploaded yet) - fail right away instead of retrying.
class PermanentJobError extends Error {}

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await claimNextJob();
  if (!job) return NextResponse.json({ processed: false, reason: "No queued jobs." });

  const { kind } = job;

  try {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (!internalSecret) throw new Error("Worker authentication is not configured.");

    // The processing route recognizes this server-only secret and performs
    // its Firestore reads/writes with Firebase Admin - no browser Firebase
    // API key or client token is needed for queued work.
    const processingResponse = await undiciFetch(resolveInternalUrl(request, kind.processPath), {
      dispatcher: processingAgent,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ userId: job.data.userId }),
    });
    const result = (await processingResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!processingResponse.ok || result.success !== true) {
      const message = typeof result.error === "string" && result.error
        ? result.error
        : `${kind.label} failed (${processingResponse.status}).`;
      throw result.retryable === false ? new PermanentJobError(message) : new Error(message);
    }

    const updated = await updateActiveClaim(kind.collection, job.id, {
      status: "complete",
      completedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
      leaseExpiresAt: null,
      ...kind.completeFields(result),
    });
    if (updated) await notifyAdvising(job.data.userId, kind.notifyReady).catch(() => {});

    return NextResponse.json({ processed: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : `${kind.label} failed.`;
    const willRetry = !(error instanceof PermanentJobError) && job.attempts < MAX_ATTEMPTS;
    const retryDelayMs = 30_000 * 2 ** Math.max(0, job.attempts - 1);
    const updated = await updateActiveClaim(kind.collection, job.id, {
      status: willRetry ? "queued" : "failed",
      ...(willRetry ? { nextAttemptAt: new Date(Date.now() + retryDelayMs) } : { failedAt: new Date() }),
      leaseExpiresAt: null,
      updatedAt: new Date(),
      lastError: message,
    });
    if (!updated) {
      return NextResponse.json({ processed: true, jobId: job.id });
    }
    if (!willRetry) await notifyAdvising(job.data.userId, kind.notifyFailed).catch(() => {});

    console.error(`${kind.label} job ${job.id} failed:`, error);
    return NextResponse.json({
      processed: false,
      jobId: job.id,
      retrying: willRetry,
      error: message,
    }, { status: willRetry ? 200 : 500 });
  }
}
