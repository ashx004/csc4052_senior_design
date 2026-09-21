import { NextRequest, NextResponse } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { extractPdfTextFromUrl, resolveInternalUrl, } from "@/src/library/pdfExtract";
import { extractTranscriptWithOllama, extractCurriculumWithOllama, } from "@/src/library/advisingOllama";
//import { doc, setDoc, serverTimestamp, } from "firebase/firestore";
//import { db } from "@/src/library/firebase";
import { FieldValue, } from "firebase-admin/firestore";
import { adminDb, } from "@/src/library/firebaseAdmin";
import { transcriptExtractionSchema, curriculumExtractionSchema, } from "@/src/library/advisingSchemas";


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


    /*console.log("PARSED TRANSCRIPT:");
    console.dir(transcriptData, { depth: null });

    console.log("PARSED CURRICULUM:");
    console.dir(curriculumData, { depth: null }); */

    
    //console.log("RAW TRANSCRIPT TEXT:");
    //console.log(transcriptText);

    //console.log("RAW CURRICULUM TEXT:");
    //console.log(curriculumText);


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