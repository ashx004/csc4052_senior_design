import { NextRequest, NextResponse } from "next/server";
import { putObject, headObject } from "@/src/library/gcsStorage";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";

/* Basically in here the transcript and curriculum sheet are being received.
Its being checked the both files are pdfs. These files are being uploaded into 
Google Cloud Storage. Being returned are the Google Cloud Storage paths to the page. */

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

function validatePdf(file: File, label: string): string | null {
  if (file.size === 0) {
    return `${label} is empty.`;
  }

  if (file.size > MAX_FILE_SIZE) {
    return `${label} must be smaller than 10 MB.`;
  }

  const isPdf =
    file.type === "application/pdf" ||
    file.name.toLowerCase().endsWith(".pdf");

  if (!isPdf) {
    return `${label} must be a PDF file.`;
  }

  return null;
}

async function uploadPdf(
  userId: string,
  documentType: "transcript" | "curriculum",
  file: File
): Promise<string> {
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const storagePath = `users/${userId}/advising/${documentType}.pdf`;
  await putObject(storagePath, fileBuffer, "application/pdf");

  return storagePath;
}


async function objectExists(storagePath: string): Promise<boolean> {
  return (await headObject(storagePath)) !== null;
}

const UPLOAD_RATE_LIMIT_WINDOW_MS = 60_000;
const UPLOAD_RATE_LIMIT_MAX = 10;

// The signed-in user decides whose folder is read or written, never a value the
// client sends. A userId that doesn't match the session is refused outright.
async function authorize(
  request: NextRequest,
  claimedUserId: unknown
): Promise<{ userId: string } | NextResponse> {
  const auth = await verifyRequestAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (typeof claimedUserId === "string" && claimedUserId.trim() && claimedUserId !== auth.uid) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return { userId: auth.uid };
}

// receive docs, validates them, & upload or replace them in Google Cloud Storage
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const authorized = await authorize(request, formData.get("userId"));
    if (authorized instanceof NextResponse) return authorized;
    const { userId } = authorized;

    const rateLimit = checkRateLimit(`advising-upload:${userId}`, UPLOAD_RATE_LIMIT_WINDOW_MS, UPLOAD_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many uploads. Please wait a moment and try again." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const transcript = formData.get("transcript");
    const curriculum = formData.get("curriculum");

    if (!(transcript instanceof File)) {
      return NextResponse.json(
        { error: "Please select your transcript." },
        { status: 400 }
      );
    }

    if (!(curriculum instanceof File)) {
      return NextResponse.json(
        { error: "Please select your curriculum sheet." },
        { status: 400 }
      );
    }

    const transcriptError = validatePdf(transcript, "Transcript");

    if (transcriptError) {
      return NextResponse.json(
        { error: transcriptError },
        { status: 400 }
      );
    }

    const curriculumError = validatePdf(curriculum, "Curriculum sheet");

    if (curriculumError) {
      return NextResponse.json(
        { error: curriculumError },
        { status: 400 }
      );
    }

    const [transcriptPath, curriculumPath] = await Promise.all([
      uploadPdf(userId, "transcript", transcript),
      uploadPdf(userId, "curriculum", curriculum),
    ]);

    return NextResponse.json({
      message: "Your documents were uploaded successfully.",
      transcript: {
        name: transcript.name,
        storagePath: transcriptPath,
      },
      curriculum: {
        name: curriculum.name,
        storagePath: curriculumPath,
      },
    });
  } catch (error) {
    console.error("Advising upload failed:", error);

    return NextResponse.json(
      { error: "Your documents could not be uploaded." },
      { status: 500 }
    );
  }
}

// checks if the user alr has a Tr or Cu sheet stored in Google Cloud Storage
export async function GET(request: NextRequest) {
  try {
    const authorized = await authorize(request, request.nextUrl.searchParams.get("userId"));
    if (authorized instanceof NextResponse) return authorized;
    const { userId } = authorized;

    const transcriptPath = `users/${userId}/advising/transcript.pdf`;
    const curriculumPath = `users/${userId}/advising/curriculum.pdf`;

    const [hasTranscript, hasCurriculum] = await Promise.all([
      objectExists(transcriptPath),
      objectExists(curriculumPath),
    ]);

    return NextResponse.json({
      hasTranscript,
      hasCurriculum,
      hasDocuments: hasTranscript && hasCurriculum,
    });
  } catch (error) {
    console.error("Could not check advising documents:", error);

    return NextResponse.json(
      { error: "The previously uploaded documents could not be checked." },
      { status: 500 }
    );
  }
}