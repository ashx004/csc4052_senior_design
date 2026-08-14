import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getIdToken, firestoreGet, firestoreUpdate, firestoreCommitBatch } from "@/src/library/firestoreRest";
import { getMinioClient } from "@/src/library/minioClient";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, IMAGE_FILE_TYPES, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { chunkText } from "@/src/library/chunking";
import { addChunkContext } from "@/src/library/contextualChunking";
import { embedTexts } from "@/src/library/ollamaEmbeddings";
import { upsertChunks, chunkPointId } from "@/src/library/vectorStore";
import { createTimeoutSignal } from "@/src/library/withTimeout";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";
import { generateCourseSummary } from "@/src/library/courseSummary";

const EMBED_RATE_LIMIT_WINDOW_MS = 60_000;
const EMBED_RATE_LIMIT_MAX = 10; // per user per window — uploads aren't normally rapid-fire

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

// Images have no embedded text — the OCR model returns a plain-text
// transcription. Instead of keeping the uploaded picture as the class's
// resource (with the transcription tucked away on it as a `transcript`
// field), persist the transcription as a real, readable .txt document in the
// class's resources and delete the original picture, which served no purpose
// once its text was captured.
async function persistImageTranscriptionAsResource(opts: {
  idToken: string;
  userId: string;
  courseId: string;
  resourceCollectionPath: string;
  resourceId: string;
  originalName: string;
  originalUrl: string;
  transcript: string;
}): Promise<void> {
  const { idToken, userId, courseId, resourceCollectionPath, resourceId, originalName, originalUrl, transcript } = opts;

  const baseName = originalName.replace(/\.[^.]+$/, "") || "transcription";
  const txtName = `${baseName}.txt`;
  const txtStoragePath = `users/${userId}/classes/${courseId}/${Date.now()}_${txtName}`;

  const s3Client = await getMinioClient();
  await s3Client.send(
    new PutObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: txtStoragePath,
      Body: Buffer.from(transcript, "utf8"),
      ContentType: "text/plain",
    })
  );

  const updated = await firestoreUpdate(idToken, resourceCollectionPath, resourceId, {
    name: txtName,
    url: `/api/download?key=${encodeURIComponent(txtStoragePath)}`,
    fileType: "txt",
    // Marks this resource as an OCR transcription rather than a plain
    // uploaded .txt file, so the UI can tag it distinctly (see
    // ResourcePreview.tsx) — the original image is gone by this point, so
    // this field is the only remaining signal that it was ever a scan.
    ocrScanned: true,
  });
  if (!updated) throw new Error("Failed to update image resource to transcript text file");

  // The uploaded picture is now orphaned — drop it so the upload doesn't
  // leave a dead copy in storage. Non-fatal if it can't be removed.
  const imageKey = decodeURIComponent(originalUrl.split("key=")[1] ?? "");
  if (imageKey) {
    await s3Client
      .send(new DeleteObjectCommand({ Bucket: MINIO_BUCKET, Key: imageKey }))
      .catch((err) => console.error(`Failed to delete uploaded image "${imageKey}":`, err));
  }
}

// Indexes a single document for semantic search: extracts its text, splits
// it into chunks, embeds each chunk on the secondary (embeddings) Ollama box,
// and stores the vectors in a `chunks` subcollection under the resource doc.
// Called in the background right after a PDF finishes uploading.
export async function POST(request: NextRequest) {
  try {
    const auth = await verifyRequestAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const idToken = getIdToken(request);
    if (!idToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const rateLimit = checkRateLimit(auth.uid, EMBED_RATE_LIMIT_WINDOW_MS, EMBED_RATE_LIMIT_MAX);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "Too many documents being indexed at once — please wait a moment." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const { userId, courseId, resourceId } = await request.json();

    if (!userId || !courseId || !resourceId) {
      return NextResponse.json(
        { error: "userId, courseId, and resourceId are required" },
        { status: 400 }
      );
    }
    if (userId !== auth.uid) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const resourceCollectionPath = `users/${userId}/enrollment/${courseId}/resources`;
    const resource = await firestoreGet(idToken, resourceCollectionPath, resourceId);

    if (!resource) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    const resourceFileType = resource.fileType as string;
    const resourceUrl = resource.url as string;
    const resourceName = resource.name as string;

    if (!SUPPORTED_DOCUMENT_TYPES.includes(resourceFileType)) {
      return NextResponse.json({ skipped: true, reason: "This file type isn't indexed for search yet." });
    }

    const fullUrl = resolveInternalUrl(request, resourceUrl);
    let text = await extractDocumentText(fullUrl, resourceFileType);

    // Images: the OCR transcription becomes the class's actual resource (a
    // readable .txt document), replacing the uploaded picture. Done before
    // the length cap below so the saved file holds the full transcription.
    if (IMAGE_FILE_TYPES.includes(resourceFileType)) {
      await persistImageTranscriptionAsResource({
        idToken,
        userId,
        courseId,
        resourceCollectionPath,
        resourceId,
        originalName: resourceName,
        originalUrl: resourceUrl,
        transcript: text,
      });
    }

    if (text.length > MAX_INDEXABLE_CHARS) {
      text = text.slice(0, MAX_INDEXABLE_CHARS);
    }

    const rawChunkObjs = chunkText(text);
    if (rawChunkObjs.length === 0) {
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

      // A single atomic commit, not one write per chunk: fewer round trips,
      // and a crash mid-write can no longer leave a resource with only some
      // of its chunks persisted. Safe as one batch (Firestore's limit is 500
      // writes) given MAX_INDEXABLE_CHARS bounds a document to well under
      // that many chunks at the default chunkText size. Chunk IDs are
      // caller-generated (chunk_${index}) rather than Firestore auto-IDs —
      // the REST :commit endpoint requires every write to name its own doc.
      await firestoreCommitBatch(
        idToken,
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

      const indexed = await firestoreUpdate(idToken, resourceCollectionPath, resourceId, {
        indexed: true,
        indexedAt: new Date(),
        chunkCount: chunks.contextualized.length,
        vectorIndexed,
      });
      if (!indexed) throw new Error("Failed to mark resource as indexed");

      // Fire-and-forget — regenerates the course's AI summary from all its
      // current documents, not just this one. Must never delay or fail the
      // upload response the student is waiting on.
      generateCourseSummary(request, userId, courseId).catch((error) =>
        console.error("Unhandled course summary generation error:", error)
      );

      return NextResponse.json({ success: true, chunkCount: chunks.contextualized.length });
    } catch (error: any) {
      cancel();
      const timedOut = signal.aborted;
      console.error(`Embed document ${timedOut ? "timed out" : "failed"} for "${resourceName}":`, error);
      await firestoreUpdate(idToken, resourceCollectionPath, resourceId, {
        indexed: false,
        indexingGaveUp: true,
        indexingGaveUpReason: timedOut ? "timeout" : "error",
        indexingGaveUpAt: new Date(),
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
