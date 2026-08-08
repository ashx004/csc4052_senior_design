import { NextRequest, NextResponse } from "next/server";
import { getAdvisingDocumentBuffer } from "@/src/library/advisingDocuments";
import { extractAdvisingDocuments } from "@/src/library/extractAdvisingDocuments";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const userId = body.userId;

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json(
        {
          error: "The user could not be identified.",
        },
        { status: 400, }
      );
    }

    const [transcriptBuffer, curriculumBuffer] =
      await Promise.all([
        getAdvisingDocumentBuffer(userId, "transcript"),
        getAdvisingDocumentBuffer(userId, "curriculum"),
      ]);

    const extractedData = await extractAdvisingDocuments(
      transcriptBuffer,
      curriculumBuffer
    );

    return NextResponse.json({
      message:
        "The advising documents were read successfully.",
      extractedData,
    });
  } catch (error) {
    console.error(
      "Advising document extraction failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error 
            ? error.message 
            : "The advising documents could not be read.",
        },
      { status: 500, }
    );
  }
}