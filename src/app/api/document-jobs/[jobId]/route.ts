import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/library/firebaseAdmin";
import { toPublicJob } from "@/src/library/jobStatus";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

const JOB_COLLECTION = "documentProcessingJobs";

// Browser-facing OCR job read. The document job has a separate identifier
// because a user may process documents in more than one course at a time.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { jobId } = await params;
  const jobDoc = await adminDb.collection(JOB_COLLECTION).doc(jobId).get();
  if (!jobDoc.exists || jobDoc.data()?.userId !== auth.uid) {
    // Do not reveal whether another student's job ID exists.
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const data = jobDoc.data()!;
  const job = toPublicJob(jobDoc.id, "ocr", data.status, (data.attempts ?? 0) > 0);
  if (!job) {
    return NextResponse.json({ error: "Job status is unavailable" }, { status: 409 });
  }

  return NextResponse.json({
    job,
    // Retained while callers transition from the legacy persisted values.
    status: data.status,
    lastError: data.lastError ?? null,
  });
}
