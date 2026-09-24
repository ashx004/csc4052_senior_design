import { NextRequest, NextResponse } from "next/server";
import type { DocumentData, UpdateData } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { isInternalRequest } from "@/src/library/verifyAuth";

const JOB_COLLECTION = "advisingExtractionJobs";

// Generously longer than the OCR job's 10-minute lease: a single advising
// job makes up to 4 sequential Ollama calls, each individually bounded by
// ADVISING_OLLAMA_TIMEOUT_MS (20 minutes by default - see advisingOllama.ts).
const JOB_LEASE_MS = 30 * 60 * 1000;

type AdvisingJob = {
  userId: string;
  attempts?: number;
  nextAttemptAt?: { toDate?: () => Date } | Date;
  leaseExpiresAt?: { toDate?: () => Date } | Date;
};

function toDate(value: { toDate?: () => Date } | Date): Date {
  return typeof (value as { toDate?: () => Date }).toDate === "function"
    ? (value as { toDate: () => Date }).toDate()
    : (value as Date);
}

function isReadyToRun(value: AdvisingJob["nextAttemptAt"]): boolean {
  if (!value) return true;
  return toDate(value).getTime() <= Date.now();
}

function hasExpiredLease(value: AdvisingJob["leaseExpiresAt"]): boolean {
  return Boolean(value && toDate(value).getTime() <= Date.now());
}

async function claimNextJob(): Promise<{ id: string; data: AdvisingJob; attempts: number } | null> {
  const candidates = await adminDb
    .collection(JOB_COLLECTION)
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
    if (claimed) return claimed;
  }

  return null;
}

async function updateActiveClaim(jobId: string, fields: UpdateData<DocumentData>): Promise<boolean> {
  const jobRef = adminDb.collection(JOB_COLLECTION).doc(jobId);
  return adminDb.runTransaction(async (transaction) => {
    const fresh = await transaction.get(jobRef);
    if (!fresh.exists || fresh.data()?.status !== "processing") return false;
    transaction.update(jobRef, fields);
    return true;
  });
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

    // The extraction route recognizes this server-only secret and performs
    // its Firestore reads/writes with Firebase Admin - no browser Firebase
    // API key or client token is needed for queued work.
    const processingResponse = await fetch(resolveInternalUrl(request, "/api/advising/extract"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify({ userId: job.data.userId }),
    });
    const result = await processingResponse.json().catch(() => ({}));
    if (!processingResponse.ok || result.success !== true) {
      throw new Error(result.error || `Advising extraction failed (${processingResponse.status}).`);
    }

    await updateActiveClaim(job.id, {
      status: "complete",
      completedAt: new Date(),
      updatedAt: new Date(),
      lastError: null,
      leaseExpiresAt: null,
      needsManualTransferReview: result.needsManualTransferReview ?? false,
      unreadableTransferInfo: result.unreadableTransferInfo ?? null,
    });

    return NextResponse.json({ processed: true, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Advising extraction failed.";
    const willRetry = job.attempts < 3;
    const retryDelayMs = 30_000 * 2 ** Math.max(0, job.attempts - 1);
    const updated = await updateActiveClaim(job.id, {
      status: willRetry ? "queued" : "failed",
      ...(willRetry ? { nextAttemptAt: new Date(Date.now() + retryDelayMs) } : { failedAt: new Date() }),
      leaseExpiresAt: null,
      updatedAt: new Date(),
      lastError: message,
    });
    if (!updated) {
      return NextResponse.json({ processed: true, jobId: job.id });
    }
    console.error(`Advising job ${job.id} failed:`, error);
    return NextResponse.json({
      processed: false,
      jobId: job.id,
      retrying: willRetry,
      error: message,
    }, { status: willRetry ? 200 : 500 });
  }
}
