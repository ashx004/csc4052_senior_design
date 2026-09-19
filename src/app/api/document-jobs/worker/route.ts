import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/library/firebaseAdmin";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { isInternalRequest } from "@/src/library/verifyAuth";

const JOB_COLLECTION = "documentProcessingJobs";
const JOB_LEASE_MS = 10 * 60 * 1000;

type DocumentJob = {
  userId: string;
  courseId: string;
  resourceId: string;
  attempts?: number;
  nextAttemptAt?: { toDate?: () => Date } | Date;
  leaseExpiresAt?: { toDate?: () => Date } | Date;
};

function toDate(value: { toDate?: () => Date } | Date): Date {
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : value as Date;
}

function isReadyToRun(value: DocumentJob["nextAttemptAt"]): boolean {
  if (!value) return true;
  return toDate(value).getTime() <= Date.now();
}

function hasExpiredLease(value: DocumentJob["leaseExpiresAt"]): boolean {
  return Boolean(value && toDate(value).getTime() <= Date.now());
}

async function claimNextJob(): Promise<{ id: string; data: DocumentJob; attempts: number } | null> {
  const candidates = await adminDb
    .collection(JOB_COLLECTION)
    .where("status", "in", ["queued", "processing"])
    .limit(20)
    .get();

  for (const candidate of candidates.docs) {
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const fresh = await transaction.get(candidate.ref);
      if (!fresh.exists) return null;

      const data = fresh.data() as DocumentJob;
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
    if (claimed) return claimed;
  }

  return null;
}

export async function POST(request: NextRequest) {
  if (!isInternalRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await claimNextJob();
  if (!job) return NextResponse.json({ processed: false, reason: "No queued jobs." });

  try {
    const internalSecret = process.env.INTERNAL_API_SECRET;
    if (!internalSecret) throw new Error("Worker authentication is not configured.");

    // The processing route recognizes this server-only secret and performs
    // its Firestore reads/writes with Firebase Admin. No browser Firebase API
    // key or client token is needed for queued work.
    const processingResponse = await fetch(resolveInternalUrl(request, "/api/embed-document"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(job.data),
    });
    const result = await processingResponse.json().catch(() => ({}));
    if (!processingResponse.ok || result.success !== true) {
      throw new Error(result.error || result.reason || `Document processing failed (${processingResponse.status}).`);
    }

    await adminDb.collection(JOB_COLLECTION).doc(job.id).update({
      status: "complete",
      completedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
      leaseExpiresAt: null,
    });
    return NextResponse.json({ processed: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Document processing failed.";
    const willRetry = job.attempts < 3;
    const retryDelayMs = 30_000 * 2 ** Math.max(0, job.attempts - 1);
    await adminDb.collection(JOB_COLLECTION).doc(job.id).update({
      status: willRetry ? "queued" : "failed",
      ...(willRetry ? { nextAttemptAt: new Date(Date.now() + retryDelayMs) } : { failedAt: new Date() }),
      leaseExpiresAt: null,
      updatedAt: new Date(),
      lastError: message,
    });
    console.error(`Document job ${job.id} failed:`, error);
    return NextResponse.json({
      processed: false,
      jobId: job.id,
      retrying: willRetry,
      error: message,
    }, { status: willRetry ? 200 : 500 });
  }
}
