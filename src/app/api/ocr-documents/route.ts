import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getIdToken, firestoreGet, firestoreUpdate } from "@/src/library/firestoreRest";
import { getMinioClient } from "@/src/library/minioClient";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

const MAX_TRANSCRIPT_CHARS = 1_000_000;

export async function PATCH(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  const idToken = getIdToken(request);
  if (!auth || !idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { userId, courseId, resourceId, action, name, transcript, pageId } = await request.json();
    if (!userId || !courseId || !resourceId || !action) {
      return NextResponse.json({ error: "userId, courseId, resourceId, and action are required" }, { status: 400 });
    }
    if (userId !== auth.uid) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const collectionPath = `users/${userId}/enrollment/${courseId}/resources`;
    const resource = await firestoreGet(idToken, collectionPath, resourceId);
    if (!resource || resource.resourceKind !== "ocr_document") {
      return NextResponse.json({ error: "OCR document not found" }, { status: 404 });
    }

    if (action === "rename") {
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!trimmedName || trimmedName.length > 200) {
        return NextResponse.json({ error: "Name must be between 1 and 200 characters" }, { status: 400 });
      }
      const updated = await firestoreUpdate(idToken, collectionPath, resourceId, {
        name: trimmedName,
        renamedAt: new Date(),
      });
      if (!updated) throw new Error("Failed to rename OCR document");
      return NextResponse.json({ success: true, name: trimmedName });
    }

    if (action === "renamePage") {
      const trimmedName = typeof name === "string" ? name.trim() : "";
      if (!pageId || typeof pageId !== "string" || !trimmedName || trimmedName.length > 200) {
        return NextResponse.json({ error: "A page ID and a name between 1 and 200 characters are required" }, { status: 400 });
      }
      const pageCollectionPath = `${collectionPath}/${resourceId}/pages`;
      const page = await firestoreGet(idToken, pageCollectionPath, pageId);
      if (!page) return NextResponse.json({ error: "OCR source image not found" }, { status: 404 });
      const updated = await firestoreUpdate(
        idToken,
        pageCollectionPath,
        pageId,
        { name: trimmedName, renamedAt: new Date() }
      );
      if (!updated) throw new Error("Failed to rename OCR page");
      return NextResponse.json({ success: true, name: trimmedName });
    }

    if (action === "editTranscript") {
      if (typeof transcript !== "string" || transcript.length > MAX_TRANSCRIPT_CHARS) {
        return NextResponse.json({ error: `Transcript must be at most ${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters` }, { status: 400 });
      }
      const transcriptStoragePath = `users/${userId}/classes/${courseId}/ocr/${resourceId}_transcript.txt`;
      const s3Client = await getMinioClient();
      await s3Client.send(new PutObjectCommand({
        Bucket: "studora",
        Key: transcriptStoragePath,
        Body: Buffer.from(transcript, "utf8"),
        ContentType: "text/plain",
      }));

      const priorRevision = typeof resource.manualTranscriptVersion === "number"
        ? resource.manualTranscriptVersion
        : 0;
      const transcriptUrl = `/api/download?key=${encodeURIComponent(transcriptStoragePath)}`;
      const updated = await firestoreUpdate(idToken, collectionPath, resourceId, {
        url: transcriptUrl,
        fileType: "txt",
        manualTranscript: true,
        manualTranscriptVersion: priorRevision + 1,
        transcriptEditedAt: new Date(),
        ocrTextLength: transcript.length,
        indexStatus: "queued",
        indexError: null,
        vectorIndexed: false,
      });
      if (!updated) throw new Error("Failed to save transcript");
      return NextResponse.json({ success: true, transcriptUrl });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("OCR document update failed:", error);
    return NextResponse.json({ error: "Failed to update OCR document" }, { status: 500 });
  }
}
