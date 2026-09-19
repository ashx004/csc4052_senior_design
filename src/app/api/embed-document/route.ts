import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import type { DocumentReference } from "firebase-admin/firestore";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import {
  getIdToken,
  firestoreGet,
  firestoreUpdate,
  firestoreCommitBatch,
  firestoreListCollection,
} from "@/src/library/firestoreRest";
import { adminDb } from "@/src/library/firebaseAdmin";
import { getMinioClient } from "@/src/library/minioClient";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, IMAGE_FILE_TYPES, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { chunkText } from "@/src/library/chunking";
import { addChunkContext } from "@/src/library/contextualChunking";
import { embedTexts } from "@/src/library/ollamaEmbeddings";
import { deleteChunksForResource, upsertChunks, chunkPointId } from "@/src/library/vectorStore";
import { createTimeoutSignal } from "@/src/library/withTimeout";
import { isInternalRequest, verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { generateCourseSummary } from "@/src/library/courseSummary";

const EMBED_RATE_LIMIT_WINDOW_MS = 60_000;
const EMBED_RATE_LIMIT_MAX = 10; // per user per window — uploads aren't normally rapid-fire
const JOB_COLLECTION = "documentProcessingJobs";

// Give up on a single document past this long rather than let one slow file
// hang the whole indexing job — confirmed live 2026-07-21.
const INDEXING_TIMEOUT_MS = 3.5 * 60 * 1000;

// Cap on how much extracted text gets indexed per document. Without this, a
// large text-dense PDF (a full textbook, not lecture notes) chunks into
// hundreds of pieces, each needing its own contextualization + embedding
// call — which has caused real Cloudflare tunnel timeouts under sustained
// load (confirmed live 2026-07-21 with a 6.9MB PDF). Generous relative to
// MAX_DOCUMENT_CHARS in the chat route (30000, for reading one document in
// full) since this covers search-retrieval chunks, not the whole document
// in one shot — missed content just can't be found by search_documents,
// while read_document still has its own separate cap for full reads.
const MAX_INDEXABLE_CHARS = 100000;

const MINIO_BUCKET = "studora";

type SourceSnapshot = {
  url: string;
  name: string;
  fileType: string;
  version: string;
};

type OcrPage = {
  id: string;
  name: string;
  url: string;
  fileType: string;
  order: number;
  ocrText?: string;
  editedText?: string;
};

function getSourceSnapshot(resource: Record<string, unknown>): SourceSnapshot {
  // Once OCR succeeds, the class resource points to the .txt transcript.
  // Keep comparing a job against the immutable original image identity.
  const url = typeof resource.ocrSourceUrl === "string" ? resource.ocrSourceUrl : String(resource.url ?? "");
  const name = typeof resource.ocrSourceName === "string" ? resource.ocrSourceName : String(resource.name ?? "");
  const fileType = typeof resource.ocrSourceFileType === "string"
    ? resource.ocrSourceFileType
    : String(resource.fileType ?? "");
  const storedVersion = typeof resource.ocrSourceVersion === "string" ? resource.ocrSourceVersion : null;
  const version = storedVersion ?? createHash("sha256")
    .update(JSON.stringify({ url, name, fileType }))
    .digest("hex");
  return { url, name, fileType, version };
}

async function getOcrDocumentSourceSnapshot(
  resourceRef: DocumentReference,
  parentData?: Record<string, unknown>
): Promise<SourceSnapshot> {
  const parent = parentData ?? ((await resourceRef.get()).data() ?? {});
  const pages = (await resourceRef.collection("pages").orderBy("order", "asc").get()).docs.map((page) => {
    const data = page.data();
    return {
      id: page.id,
      url: typeof data.url === "string" ? data.url : "",
      name: typeof data.name === "string" ? data.name : "",
      fileType: typeof data.fileType === "string" ? data.fileType : "",
      order: typeof data.order === "number" ? data.order : 0,
    };
  });
  // A manual transcript is a new source for indexing even if its images have
  // not changed. Automatic OCR output, by contrast, is derived from pages.
  const manualRevision = parent.manualTranscript === true && typeof parent.manualTranscriptVersion === "number"
    ? parent.manualTranscriptVersion
    : null;
  const version = createHash("sha256").update(JSON.stringify({ pages, manualRevision })).digest("hex");
  return {
    url: `ocr-document://${resourceRef.id}`,
    name: "OCR document",
    fileType: "txt",
    version,
  };
}

async function getOcrPages(resourceRef: DocumentReference): Promise<OcrPage[]> {
  return (await resourceRef.collection("pages").orderBy("order", "asc").get()).docs.map((page) => {
    const data = page.data();
    return {
      id: page.id,
      name: typeof data.name === "string" ? data.name : "Untitled page",
      url: typeof data.url === "string" ? data.url : "",
      fileType: typeof data.fileType === "string" ? data.fileType : "",
      order: typeof data.order === "number" ? data.order : 0,
      ocrText: typeof data.ocrText === "string" ? data.ocrText : undefined,
      editedText: typeof data.editedText === "string" ? data.editedText : undefined,
    };
  });
}

// Images have no embedded text — the OCR model returns a plain-text
// transcription. The text file replaces the image as the class resource, so
// both students and the AI use the same readable document. The source image
// remains in object storage, but is no longer listed as a class resource.
async function persistImageTranscript(opts: {
  userId: string;
  courseId: string;
  resourceId: string;
  originalName: string;
  originalFileType: string;
  originalUrl: string;
  sourceVersion: string;
  transcript: string;
  updateResource: (fields: Record<string, unknown>) => Promise<boolean>;
}): Promise<void> {
  const { userId, courseId, resourceId, originalName, originalFileType, originalUrl, sourceVersion, transcript, updateResource } = opts;
  const baseName = originalName.replace(/\.[^.]+$/, "") || "transcription";
  const txtName = `${baseName}.txt`;
  // A stable key lets a retry replace its own transcript rather than leave
  // another orphaned object in storage.
  const transcriptStoragePath = `users/${userId}/classes/${courseId}/ocr/${resourceId}_${txtName}`;

  const s3Client = await getMinioClient();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: transcriptStoragePath,
      Body: Buffer.from(transcript, "utf8"),
      ContentType: "text/plain",
    })
  );

  const transcriptUrl = `/api/download?key=${encodeURIComponent(transcriptStoragePath)}`;
  const updated = await updateResource({
    // The transcription becomes the resource students browse and the AI
    // indexes. The original upload remains in object storage at ocrSourceUrl.
    name: txtName,
    url: transcriptUrl,
    fileType: "txt",
    ocrScanned: true,
    ocrStatus: "complete",
    ocrSourceUrl: originalUrl,
    ocrSourceName: originalName,
    ocrSourceFileType: originalFileType,
    ocrSourceVersion: sourceVersion,
    ocrTranscriptUrl: transcriptUrl,
    ocrTextLength: transcript.length,
    ocrModel: process.env.OLLAMA_OCR_MODEL ?? null,
    ocrCompletedAt: new Date(),
    ocrFailedAt: null,
    ocrError: null,
  });
  if (!updated) throw new Error("Failed to save OCR transcript metadata");

}

async function persistOcrDocumentTranscript(opts: {
  userId: string;
  courseId: string;
  resourceId: string;
  transcript: string;
  pageManifestVersion: string;
  pageCount: number;
  updateResource: (fields: Record<string, unknown>) => Promise<boolean>;
}): Promise<void> {
  const { userId, courseId, resourceId, transcript, pageManifestVersion, pageCount, updateResource } = opts;
  const transcriptStoragePath = `users/${userId}/classes/${courseId}/ocr/${resourceId}_transcript.txt`;
  const s3Client = await getMinioClient();
  await s3Client.send(new PutObjectCommand({
    Bucket: MINIO_BUCKET,
    Key: transcriptStoragePath,
    Body: Buffer.from(transcript, "utf8"),
    ContentType: "text/plain",
  }));

  const transcriptUrl = `/api/download?key=${encodeURIComponent(transcriptStoragePath)}`;
  const updated = await updateResource({
    url: transcriptUrl,
    fileType: "txt",
    resourceKind: "ocr_document",
    ocrScanned: true,
    ocrStatus: "complete",
    ocrTranscriptUrl: transcriptUrl,
    ocrTextLength: transcript.length,
    ocrModel: process.env.OLLAMA_OCR_MODEL ?? null,
    pageManifestVersion,
    pageCount,
    manualTranscript: false,
    manualTranscriptVersion: null,
    ocrCompletedAt: new Date(),
    ocrFailedAt: null,
    ocrError: null,
  });
  if (!updated) throw new Error("Failed to save OCR document transcript metadata");
}

function getErrorMessage(error: unknown, fallback: string): string {
  const message = error instanceof Error ? error.message : fallback;
  return message.slice(0, 500);
}

// Indexes a single document for semantic search: extracts its text, splits
// it into chunks, embeds each chunk on the secondary (embeddings) Ollama box,
// and stores the vectors in a `chunks` subcollection under the resource doc.
// Called in the background right after a PDF finishes uploading.
export async function POST(request: NextRequest) {
  try {
    const internal = isInternalRequest(request);
    let idToken: string | null = null;
    let userAuth: { uid: string } | null = null;
    if (!internal) {
      userAuth = await verifyRequestAuth(request);
      if (!userAuth) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }

      idToken = getIdToken(request);
      if (!idToken) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }

    if (!internal) {
      const rateLimit = checkRateLimit(userAuth!.uid, EMBED_RATE_LIMIT_WINDOW_MS, EMBED_RATE_LIMIT_MAX);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { error: "Too many documents being queued at once — please wait a moment." },
          { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
        );
      }
    }

    const { userId, courseId, resourceId, sourceVersion: requestedSourceVersion } = await request.json();

    if (!userId || !courseId || !resourceId) {
      return NextResponse.json(
        { error: "userId, courseId, and resourceId are required" },
        { status: 400 }
      );
    }
    if (!internal && userId !== userAuth!.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resourceCollectionPath = `users/${userId}/enrollment/${courseId}/resources`;
    const resourceRef = adminDb.doc(`${resourceCollectionPath}/${resourceId}`);
    const resource = internal
      ? ((await resourceRef.get()).data() ?? null)
      : await firestoreGet(idToken!, resourceCollectionPath, resourceId);

    if (!resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    const resourceFileType = resource.fileType as string;
    const resourceUrl = resource.url as string;
    const resourceName = resource.name as string;
    const isOcrDocument = resource.resourceKind === "ocr_document";
    const source = isOcrDocument
      ? await getOcrDocumentSourceSnapshot(resourceRef, resource)
      : getSourceSnapshot(resource);

    // An old worker may wake up after a resource has been replaced. Do not
    // let it transcribe/index the previous upload over the current one.
    if (internal && typeof requestedSourceVersion === "string" && requestedSourceVersion !== source.version) {
      return NextResponse.json({
        success: true,
        skipped: true,
        superseded: true,
        reason: "The source document changed before this job started.",
      });
    }
    const expectedSourceVersion = internal && typeof requestedSourceVersion === "string"
      ? requestedSourceVersion
      : null;
    const sourceIsCurrent = async (): Promise<boolean> => {
      if (!expectedSourceVersion) return true;
      const latest = await resourceRef.get();
      if (!latest.exists) return false;
      const currentSource = latest.data()?.resourceKind === "ocr_document"
        ? await getOcrDocumentSourceSnapshot(resourceRef, latest.data() ?? {})
        : getSourceSnapshot(latest.data() ?? {});
      return currentSource.version === expectedSourceVersion;
    };

    if (!isOcrDocument && !SUPPORTED_DOCUMENT_TYPES.includes(resourceFileType)) {
      return NextResponse.json({ skipped: true, reason: "This file type isn't indexed for search yet." });
    }

    // Browser requests keep using their Firebase ID token and Firestore
    // rules. A request bearing the server-only internal secret is a claimed
    // queue job, so it uses Firebase Admin instead of minting a client token.
    const updateResource = async (fields: Record<string, unknown>): Promise<boolean> => {
      if (internal) {
        if (!expectedSourceVersion) {
          await resourceRef.set(fields, { merge: true });
          return true;
        }
        return adminDb.runTransaction(async (transaction) => {
          const latest = await transaction.get(resourceRef);
          if (!latest.exists) return false;
          const latestData = latest.data() ?? {};
          const latestSource = latestData.resourceKind === "ocr_document"
            ? await getOcrDocumentSourceSnapshot(resourceRef, latestData)
            : getSourceSnapshot(latestData);
          if (latestSource.version !== expectedSourceVersion) {
            return false;
          }
          transaction.set(resourceRef, fields, { merge: true });
          return true;
        });
      }
      return firestoreUpdate(idToken!, resourceCollectionPath, resourceId, fields);
    };

    const chunkCollectionPath = `${resourceCollectionPath}/${resourceId}/chunks`;
    const replaceChunks = async (writes: { path: string; fields: Record<string, unknown> }[]): Promise<void> => {
      if (!(await sourceIsCurrent())) {
        throw new Error("The source document changed before its chunks could be replaced.");
      }
      const chunkIds = internal
        ? (await adminDb.collection(chunkCollectionPath).get()).docs.map((doc) => doc.id)
        : (await firestoreListCollection(idToken!, chunkCollectionPath)).map((doc) => doc.id);
      const incomingIds = new Set(writes.map((write) => write.path.split("/").pop()));
      const staleChunkIds = chunkIds.filter((id) => !incomingIds.has(id));
      if (writes.length + staleChunkIds.length > 500) {
        throw new Error("Too many chunks to replace atomically.");
      }

      // One commit writes the new chunks and deletes stale ones. There is no
      // point at which a completed resource can contain a mixed old/new set.
      if (!internal) {
        await firestoreCommitBatch(
          idToken!,
          writes,
          staleChunkIds.map((id) => `${chunkCollectionPath}/${id}`)
        );
        return;
      }

      const batch = adminDb.batch();
      staleChunkIds.forEach((id) => batch.delete(adminDb.doc(`${chunkCollectionPath}/${id}`)));
      writes.forEach((write) => batch.set(adminDb.doc(write.path), write.fields));
      await batch.commit();
    };

    if (!internal) {
      const jobId = `${userId}_${courseId}_${resourceId}`;
      const jobRef = adminDb.collection(JOB_COLLECTION).doc(jobId);
      const existingJob = (await jobRef.get()).data();
      const existingStatus = existingJob?.status;
      if (
        (existingStatus === "queued" || existingStatus === "processing") &&
        existingJob?.sourceVersion === source.version
      ) {
        return NextResponse.json({ queued: true, jobId, status: existingStatus }, { status: 202 });
      }

      const queuedStatus = (isOcrDocument && resource.manualTranscript !== true) || IMAGE_FILE_TYPES.includes(resourceFileType)
        ? { ocrStatus: "queued", ocrError: null }
        : { indexStatus: "queued", indexError: null };
      const markedQueued = await updateResource(queuedStatus);
      if (!markedQueued) throw new Error("Failed to mark document processing as queued");

      await jobRef.set({
        userId,
        courseId,
        resourceId,
        sourceVersion: source.version,
        sourceUrl: source.url,
        sourceName: source.name,
        sourceFileType: source.fileType,
        status: "queued",
        attempts: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastError: null,
      });

      // Best-effort immediate pickup; the dedicated worker process also
      // drains any jobs that survive a server restart or temporary failure.
      if (process.env.INTERNAL_API_SECRET) {
        fetch(resolveInternalUrl(request, "/api/document-jobs/worker"), {
          method: "POST",
          headers: { "x-internal-secret": process.env.INTERNAL_API_SECRET },
        }).catch((error) => console.error(`Failed to start document worker for ${jobId}:`, error));
      }
      return NextResponse.json({ queued: true, jobId, status: "queued" }, { status: 202 });
    }

    const isImage = IMAGE_FILE_TYPES.includes(resourceFileType);
    const usesManualTranscript = isOcrDocument && resource.manualTranscript === true;
    const needsOcr = isImage || (isOcrDocument && !usesManualTranscript);
    const fullUrl = resolveInternalUrl(request, resourceUrl);
    let text: string;
    try {
      if (needsOcr) {
        const markedProcessing = await updateResource({
          ocrStatus: "processing",
          ocrStartedAt: new Date(),
          ocrCompletedAt: null,
          ocrFailedAt: null,
          ocrError: null,
        });
        if (!markedProcessing) throw new Error("Failed to mark OCR as processing");
      }

      if (isOcrDocument && !usesManualTranscript) {
        const pages = await getOcrPages(resourceRef);
        if (pages.length === 0) throw new Error("Add at least one image page before transcribing this document.");

        const pageTexts: string[] = [];
        for (const page of pages) {
          let pageText = page.editedText ?? page.ocrText;
          if (!pageText) {
            if (!IMAGE_FILE_TYPES.includes(page.fileType)) {
              throw new Error(`Page "${page.name}" is not a supported image type.`);
            }
            await resourceRef.collection("pages").doc(page.id).set({
              ocrStatus: "processing",
              ocrStartedAt: new Date(),
              ocrError: null,
            }, { merge: true });
            pageText = await extractDocumentText(resolveInternalUrl(request, page.url), page.fileType);
            await resourceRef.collection("pages").doc(page.id).set({
              ocrText: pageText,
              ocrStatus: "complete",
              ocrCompletedAt: new Date(),
              ocrError: null,
            }, { merge: true });
          }
          pageTexts.push(`--- Page ${page.order + 1}: ${page.name} ---\n${pageText.trim()}`);
        }
        if (!(await sourceIsCurrent())) {
          return NextResponse.json({ success: true, skipped: true, superseded: true, reason: "The page set changed during OCR." });
        }
        text = pageTexts.join("\n\n").trim();
        await persistOcrDocumentTranscript({
          userId,
          courseId,
          resourceId,
          transcript: text,
          pageManifestVersion: source.version,
          pageCount: pages.length,
          updateResource,
        });
      } else {
        text = await extractDocumentText(fullUrl, resourceFileType);
      }

      if (isImage) {
        if (!(await sourceIsCurrent())) {
          return NextResponse.json({ success: true, skipped: true, superseded: true, reason: "The source document changed during OCR." });
        }
        await persistImageTranscript({
          userId,
          courseId,
          resourceId,
          originalName: resourceName,
          originalFileType: resourceFileType,
          originalUrl: resourceUrl,
          sourceVersion: source.version,
          transcript: text,
          updateResource,
        });
      }
    } catch (error) {
      if (needsOcr) {
        const markedFailed = await updateResource({
          ocrStatus: "failed",
          ocrError: getErrorMessage(error, "OCR transcription failed."),
          ocrFailedAt: new Date(),
        });
        if (!markedFailed) console.error(`Failed to save OCR failure state for "${resourceName}"`);
      }
      throw error;
    }

    const markedIndexing = await updateResource({
      indexed: false,
      vectorIndexed: false,
      indexStatus: "processing",
      indexStartedAt: new Date(),
      indexCompletedAt: null,
      indexFailedAt: null,
      indexError: null,
    });
    if (!markedIndexing) {
      throw new Error("Failed to mark AI indexing as processing");
    }

    if (text.length > MAX_INDEXABLE_CHARS) {
      text = text.slice(0, MAX_INDEXABLE_CHARS);
    }

    const rawChunkObjs = chunkText(text);
    if (rawChunkObjs.length === 0) {
      // A failed/empty re-transcription must not leave the old document
      // searchable. Remove both retrieval representations before reporting
      // the resource as having no usable text.
      try {
        await replaceChunks([]);
        await deleteChunksForResource(userId, resourceId);
      } catch (error) {
        await updateResource({
          indexed: false,
          vectorIndexed: false,
          indexStatus: "failed",
          indexError: getErrorMessage(error, "Failed to clear old document chunks."),
          indexFailedAt: new Date(),
        });
        return NextResponse.json({ skipped: true, reason: "Failed to clear old document chunks." }, { status: 500 });
      }
      await updateResource({
        indexed: false,
        vectorIndexed: false,
        indexStatus: "failed",
        indexError: "No extractable text.",
        indexFailedAt: new Date(),
      });
      return NextResponse.json({ skipped: true, reason: "No extractable text." });
    }
    const rawChunks = rawChunkObjs.map((c) => c.text);
    const pages = rawChunkObjs.map((c) => c.page);

    const { signal, cancel } = createTimeoutSignal(INDEXING_TIMEOUT_MS, `Indexing "${resourceName}"`);
    try {
      // Contextual Retrieval: situate each chunk within the document before
      // embedding/indexing it, so retrieval (both dense and keyword) can
      // find it even when the chunk alone lost the referent that made it
      // relevant. This (plus embedding) is the slow part, so it's the part
      // bounded by INDEXING_TIMEOUT_MS — via a real AbortSignal, so giving
      // up here actually stops the underlying requests instead of just
      // abandoning them to keep running in the background.
      const contextualized = await addChunkContext(text, rawChunks, signal);
      const embeddings = await embedTexts(contextualized, signal);
      const chunks = { contextualized, embeddings };
      cancel();

      if (!(await sourceIsCurrent())) {
        return NextResponse.json({ success: true, skipped: true, superseded: true, reason: "The source document changed during indexing." });
      }

      // A single atomic commit, not one write per chunk: fewer round trips,
      // and a crash mid-write can no longer leave a resource with only some
      // of its chunks persisted. Safe as one batch (Firestore's limit is 500
      // writes) given MAX_INDEXABLE_CHARS bounds a document to well under
      // that many chunks at the default chunkText size. Chunk IDs are
      // caller-generated (chunk_${index}) rather than Firestore auto-IDs —
      // the REST :commit endpoint requires every write to name its own doc.
      await replaceChunks(
        chunks.contextualized.map((chunkValue, index) => ({
          path: `${resourceCollectionPath}/${resourceId}/chunks/chunk_${index}`,
          fields: {
            text: chunkValue,
            embedding: chunks.embeddings[index],
            chunkIndex: index,
            // Firestore rejects `undefined` field values outright, unlike
            // Qdrant below — null is the correct "no page" representation
            // here for non-PDF sources.
            page: pages[index] ?? null,
          },
        }))
      );

      // Firestore above stays the source of truth for chunk existence/
      // metadata (document-management UI reads it); Qdrant is the fast
      // search index searchDocuments (api/chat/route.ts) actually queries.
      // Best-effort: a Qdrant hiccup shouldn't fail an otherwise-successful
      // indexing job — vectorIndexed stays false/unset so searchDocuments
      // routes this resource to the old Firestore scan until a future
      // successful index (or the one-time backfill script) picks it up.
      let vectorIndexed = false;
      try {
        // Chunk point IDs are deterministic. Upserting a shorter replacement
        // document would otherwise leave its old higher-numbered points in
        // Qdrant, so replace this resource's entire vector set first.
        if (!(await sourceIsCurrent())) {
          return NextResponse.json({ success: true, skipped: true, superseded: true, reason: "The source document changed during indexing." });
        }
        await deleteChunksForResource(userId, resourceId);
        await upsertChunks(
          chunks.contextualized.map((chunkValue, index) => ({
            id: chunkPointId(resourceId, index),
            vector: chunks.embeddings[index],
            payload: {
              userId,
              courseId,
              resourceId,
              chunkIndex: index,
              text: chunkValue,
              ...(pages[index] !== undefined ? { page: pages[index] } : {}),
            },
          }))
        );
        vectorIndexed = true;
      } catch (error) {
        console.error(`Qdrant upsert failed for "${resourceName}" (falling back to Firestore search for it):`, error);
      }

      const indexed = await updateResource({
        indexed: true,
        indexedAt: new Date(),
        chunkCount: chunks.contextualized.length,
        vectorIndexed,
        indexStatus: "complete",
        indexCompletedAt: new Date(),
        indexFailedAt: null,
        indexError: null,
      });
      if (!indexed) throw new Error("Failed to mark resource as indexed");

      // Fire-and-forget — regenerates the course's AI summary from all its
      // current documents, not just this one. Must never delay or fail the
      // upload response the student is waiting on.
      generateCourseSummary(request, userId, courseId, { useAdmin: internal }).catch((error) =>
        console.error("Unhandled course summary generation error:", error)
      );

      return NextResponse.json({ success: true, chunkCount: chunks.contextualized.length });
    } catch (error: any) {
      cancel();
      const timedOut = signal.aborted;
      console.error(`Embed document ${timedOut ? "timed out" : "failed"} for "${resourceName}":`, error);
      await updateResource({
        indexed: false,
        vectorIndexed: false,
        indexingGaveUp: true,
        indexingGaveUpReason: timedOut ? "timeout" : "error",
        indexingGaveUpAt: new Date(),
        indexStatus: "failed",
        indexError: getErrorMessage(
          error,
          timedOut ? "AI indexing timed out." : "AI indexing failed."
        ),
        indexFailedAt: new Date(),
      });
      return NextResponse.json(
        { skipped: true, reason: timedOut ? "Indexing took too long — gave up." : "Failed to index document." },
        { status: timedOut ? 200 : 500 }
      );
    }
  } catch (error) {
    console.error("Embed document error:", error);
    return NextResponse.json({ error: "Failed to index document." }, { status: 500 });
  }
}
