import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { chunkText } from "@/src/library/chunking";
import { addChunkContext } from "@/src/library/contextualChunking";
import { embedTexts } from "@/src/library/ollamaEmbeddings";
import { createTimeoutSignal } from "@/src/library/withTimeout";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { checkRateLimit } from "@/src/library/rateLimit";

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

    const resourceRef = doc(db, "users", userId, "enrollment", courseId, "resources", resourceId);
    const resourceSnap = await getDoc(resourceRef);

    if (!resourceSnap.exists()) {
      return NextResponse.json({ error: "Resource not found" }, { status: 404 });
    }

    const resource = resourceSnap.data();

    if (!SUPPORTED_DOCUMENT_TYPES.includes(resource.fileType)) {
      return NextResponse.json({ skipped: true, reason: "This file type isn't indexed for search yet." });
    }

    const fullUrl = resolveInternalUrl(request, resource.url);
    let text = await extractDocumentText(fullUrl, resource.fileType);
    if (text.length > MAX_INDEXABLE_CHARS) {
      text = text.slice(0, MAX_INDEXABLE_CHARS);
    }

    const rawChunks = chunkText(text);
    if (rawChunks.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No extractable text." });
    }

    const { signal, cancel } = createTimeoutSignal(INDEXING_TIMEOUT_MS, `Indexing "${resource.name}"`);
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

      const chunksRef = collection(resourceRef, "chunks");
      await Promise.all(
        chunks.contextualized.map((chunkValue, index) =>
          addDoc(chunksRef, {
            text: chunkValue,
            embedding: chunks.embeddings[index],
            chunkIndex: index,
          })
        )
      );

      await updateDoc(resourceRef, {
        indexed: true,
        indexedAt: serverTimestamp(),
        chunkCount: chunks.contextualized.length,
      });

      return NextResponse.json({ success: true, chunkCount: chunks.contextualized.length });
    } catch (error: any) {
      cancel();
      const timedOut = signal.aborted;
      console.error(`Embed document ${timedOut ? "timed out" : "failed"} for "${resource.name}":`, error);
      await updateDoc(resourceRef, {
        indexed: false,
        indexingGaveUp: true,
        indexingGaveUpReason: timedOut ? "timeout" : "error",
        indexingGaveUpAt: serverTimestamp(),
      }).catch(() => {});
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
