import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { extractPdfTextFromUrl, resolveInternalUrl, } from "@/src/library/pdfExtract";
import { extractTranscriptWithOllama, extractCurriculumWithOllama, } from "@/src/library/advisingOllama";
import { FieldValue, } from "firebase-admin/firestore";
import { adminDb, } from "@/src/library/firebaseAdmin";
import { transcriptExtractionSchema, curriculumExtractionSchema, } from "@/src/library/advisingSchemas";
import { cleanTranscriptTextForOllama } from "@/src/library/advisingTranscriptCleanup";

export async function POST(request: NextRequest) {
  try {

    const auth = await verifyRequestAuth(request);

    if (!auth) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const userId = auth.uid;

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


    console.log("FINAL TRANSCRIPT DATA TO SAVE:");
    console.dir(transcriptData, { depth: null });

    console.log("FINAL CURRICULUM DATA TO SAVE:");
    console.dir(curriculumData, { depth: null });


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
      message: "Documents were extracted and saved successfully.",
      transcript: transcriptData,
      curriculum: curriculumData,
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