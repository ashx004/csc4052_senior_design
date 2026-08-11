import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { extractPdfTextFromUrl, resolveInternalUrl, } from "@/src/library/pdfExtract";
import { extractTranscriptWithOllama, extractCurriculumWithOllama, } from "@/src/library/advisingOllama";
import { doc, setDoc, serverTimestamp, } from "firebase/firestore";
import { db } from "@/src/library/firebase";


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

    const transcriptText = await extractPdfTextFromUrl(transcriptUrl);
    const curriculumText = await extractPdfTextFromUrl(curriculumUrl);

    const transcriptResponse = await extractTranscriptWithOllama(transcriptText);
    const curriculumResponse = await extractCurriculumWithOllama(curriculumText);

    const transcriptData = JSON.parse(transcriptResponse);
    const curriculumData = JSON.parse(curriculumResponse);

    console.log("PARSED TRANSCRIPT:");
    console.dir(transcriptData, { depth: null });

    console.log("PARSED CURRICULUM:");
    console.dir(curriculumData, { depth: null });

    const transcriptRef = doc(db, "users", userId, "transcript", "data" );
    const curriculumRef = doc(db, "users", userId, "curriculum", "data" );

    // Save extracted information
    await Promise.all([
      // put this data at the firestore document users/{userId}/transcript/data
      setDoc (transcriptRef,
        { // every field ollama extracts=ed, put it into the firestore document
          ...transcriptData,
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      ),

      setDoc (curriculumRef,
        {
          ...curriculumData,
          updatedAt: serverTimestamp(),
        },
        { merge: false }
      ),
    ]);


    return NextResponse.json({
      message: "Documents were extracted and saved successfully.",
      transcript: transcriptData,
      curriculum: curriculumData,
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