import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getMinioClient } from "@/src/library/minioClient";

/* Basically in here the transcript and curriculum sheet are being received.
Its being checked the both files are pdfs. These files are being uploaded into 
MinIO. Being returned are the MinIO paths to the page. */

const BUCKET_NAME = "studora";
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
  const minioClient = await getMinioClient();

  await minioClient.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storagePath,
      Body: fileBuffer,
      ContentType: "application/pdf",
    })
  );

  return storagePath;
}

async function objectExists(storagePath: string): Promise<boolean> {
  try {
    const minioClient = await getMinioClient();

    await minioClient.send(
      new HeadObjectCommand({
        Bucket: BUCKET_NAME,
        Key: storagePath,
      })
    );

    return true;
  } catch (error: any) {
    if (
      error?.name === "NotFound" ||
      error?.$metadata?.httpStatusCode === 404
    ) {
      return false;
    }

    throw error;
  }
}

// receive docs, validates them, & upload or replace them in MinIO
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const userId = formData.get("userId");
    const transcript = formData.get("transcript");
    const curriculum = formData.get("curriculum");

    if (typeof userId !== "string" || !userId.trim()) {
      return NextResponse.json(
        { error: "The user could not be identified." },
        { status: 400 }
      );
    }

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

// checks if the user alr has a Tr or Cu sheet stored in MinIO
export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId?.trim()) {
      return NextResponse.json(
        { error: "The user could not be identified." },
        { status: 400 }
      );
    }

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