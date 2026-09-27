import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth, isInternalRequest } from "@/src/library/verifyAuth";
import { extractPdfTextFromUrl, resolveInternalUrl, } from "@/src/library/pdfExtract";
import { EXTRACTION_JOBS, enqueueAdvisingJob, readAdvisingJob } from "@/src/library/advisingJobs";
import { extractTranscriptWithOllama, extractCurriculumWithOllama, } from "@/src/library/advisingOllama";
import { FieldValue, } from "firebase-admin/firestore";
import { adminDb, } from "@/src/library/firebaseAdmin";
import { transcriptExtractionSchema, curriculumExtractionSchema, } from "@/src/library/advisingSchemas";
import { cleanTranscriptTextForOllama } from "@/src/library/advisingTranscriptCleanup";
import { findTermCreditMismatches } from "@/src/library/advisingTranscriptChecks";
import { checkRateLimit } from "@/src/library/rateLimit";

const EXTRACT_RATE_LIMIT_WINDOW_MS = 60_000;
const EXTRACT_RATE_LIMIT_MAX = 5; // one real upload plus a couple of retries, generously

// A transcript + curriculum extraction makes up to 4 sequential AI calls
// (transcript, then program info, main requirements, and concentrations).
// That routinely runs well past the ~100s timeout the Cloudflare tunnel in
// front of this deployment enforces on any single request - see
// advisingOllama.ts. So this route now works like /api/embed-document: the
// browser only ever gets a fast "queued" response and polls for the result;
// the actual work happens server-to-server via /api/advising-jobs/worker,
// where a slow/timed-out attempt just gets retried instead of surfacing a
// raw Cloudflare error page to the student.

export async function POST(request: NextRequest) {
  if (isInternalRequest(request)) {
    return processExtraction(request);
  }
  return enqueueExtraction(request);
}

// Browser-facing: kicks off (or reports) a background extraction job.
async function enqueueExtraction(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rateLimit = checkRateLimit(auth.uid, EXTRACT_RATE_LIMIT_WINDOW_MS, EXTRACT_RATE_LIMIT_MAX);
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });
  }

  await enqueueAdvisingJob(request, EXTRACTION_JOBS, auth.uid, {
    needsManualTransferReview: false,
    unreadableTransferInfo: null,
  });

  return NextResponse.json({ queued: true, status: "queued" }, { status: 202 });
}

// Browser-facing: polled by the frontend until the job completes or fails,
// and read on page load to resume a job the student left running.
export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { status, data } = await readAdvisingJob(request, EXTRACTION_JOBS, auth.uid);
  return NextResponse.json({
    status,
    lastError: data?.lastError ?? null,
    needsManualTransferReview: data?.needsManualTransferReview ?? false,
    unreadableTransferInfo: data?.unreadableTransferInfo ?? null,
  });
}

// Internal-only: does the actual PDF + AI extraction work. Called
// server-to-server by /api/advising-jobs/worker, never directly by a
// browser, so it's free to take as long as it needs.
async function processExtraction(request: NextRequest) {
  try {
    const { userId } = await request.json();
    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    const transcriptPath = `users/${userId}/advising/transcript.pdf`;
    const curriculumPath = `users/${userId}/advising/curriculum.pdf`;

    const transcriptUrl = resolveInternalUrl(
      request, `/api/download?key=${encodeURIComponent(transcriptPath)}` );
    const curriculumUrl = resolveInternalUrl(
      request, `/api/download?key=${encodeURIComponent(curriculumPath)}`);

    const rawTranscriptText = await extractPdfTextFromUrl(transcriptUrl);
    const curriculumText = await extractPdfTextFromUrl(curriculumUrl);

    // Advising-specific cleanup (PII redaction, summary-noise stripping)
    const transcriptText = cleanTranscriptTextForOllama(rawTranscriptText);


    // ask ollama to extract the data
    const transcriptResponse = await extractTranscriptWithOllama(transcriptText);
    const curriculumResponse = await extractCurriculumWithOllama(curriculumText);

    // convert ollama's json strings into javascript objects
    const rawTranscriptData = JSON.parse(transcriptResponse);
    const rawCurriculumData = JSON.parse(curriculumResponse);

    /* validate the objects against the structures defined in advisingSchema.ts.
       if Ollama returns the wrong structure, .parse() throws an error and nothing
       gets saved to Firestore. */

    const transcriptData = transcriptExtractionSchema.parse(rawTranscriptData);
    const creditMismatches = findTermCreditMismatches(rawTranscriptText, transcriptData.courses);

    // "B R" becomes "B". A lone "R" is not a grade.
    for (const course of transcriptData.courses) {
      if (!course.grade) continue;
      const cleaned = course.grade.trim().replace(/\s+R$/i, "");
      course.grade = cleaned === "" || cleaned.toUpperCase() === "R" ? null : cleaned;

      // An "IP" grade always means the course is being taken now. The model
      // occasionally labels it something else, and then the course counts as
      // not taken yet and the schedule starts in the current quarter.
      if (course.grade?.toUpperCase() === "IP") course.status = "in-progress";
    }

    transcriptData.warnings.push(...creditMismatches);

    // Never save an empty read over good data.
    if (transcriptData.courses.length === 0) {
      throw new Error("No courses could be read from your transcript. Please check that you uploaded the right file.");
    }

    const curriculumData = curriculumExtractionSchema.parse(rawCurriculumData);

    // Detect the structured marker so the frontend can prompt the student
    // to manually enter transfer credit that couldn't be read from the PDF
    // (e.g. a font-encoding issue stripped course codes/titles from a table
    // row, leaving only numeric credit/grade columns).
    const UNREADABLE_TRANSFER_MARKER = /^UNREADABLE_TRANSFER_ROWS: (\d+) rows totaling ([\d.]+) credit hours/;

    function findUnreadableTransferWarning(warnings: string[]) {
      for (const warning of warnings) {
        const match = warning.match(UNREADABLE_TRANSFER_MARKER);
        if (match) {
          return {
            rowCount: Number(match[1]),
            totalCreditHours: Number(match[2]),
            rawWarning: warning,
          };
        }
      }
      return null;
    }

    const unreadableTransfer = findUnreadableTransferWarning(transcriptData.warnings);


    console.log(`Extracted ${transcriptData.courses.length} courses, ${curriculumData.requirements.length} requirements, ${creditMismatches.length} credit warnings`);


    // firestore document locations
    const transcriptRef =
      adminDb.collection("users").doc(userId).collection("transcript").doc("data");

    const curriculumRef =
      adminDb.collection("users").doc(userId).collection("curriculum").doc("data");


    // save the validated data. marge false means the old document is completely replaced
    await Promise.all([
      transcriptRef.set({
        ...transcriptData,
        updatedAt:
          FieldValue.serverTimestamp(),
      }),

      curriculumRef.set({
        ...curriculumData,
        updatedAt:
          FieldValue.serverTimestamp(),
      }),
    ]);


    return NextResponse.json({
      success: true,
      needsManualTransferReview: unreadableTransfer !== null,
      unreadableTransferInfo: unreadableTransfer,
  });
  } catch (error) {
    console.error("Advising extraction failed:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "The advising documents could not be read.",
      },
      { status: 500 }
    );
  }
}
