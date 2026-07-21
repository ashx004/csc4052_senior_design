import { NextRequest, NextResponse } from "next/server";
import { doc, getDoc, collection, addDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { chunkText } from "@/src/library/chunking";
import { addChunkContext } from "@/src/library/contextualChunking";
import { embedTexts } from "@/src/library/ollamaEmbeddings";

// Indexes a single document for semantic search: extracts its text, splits
// it into chunks, embeds each chunk on the secondary (embeddings) Ollama box,
// and stores the vectors in a `chunks` subcollection under the resource doc.
// Called in the background right after a PDF finishes uploading.
export async function POST(request: NextRequest) {
  try {
    const { userId, courseId, resourceId } = await request.json();

    if (!userId || !courseId || !resourceId) {
      return NextResponse.json(
        { error: "userId, courseId, and resourceId are required" },
        { status: 400 }
      );
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
    const text = await extractDocumentText(fullUrl, resource.fileType);

    const rawChunks = chunkText(text);
    if (rawChunks.length === 0) {
      return NextResponse.json({ skipped: true, reason: "No extractable text." });
    }

    // Contextual Retrieval: situate each chunk within the document before
    // embedding/indexing it, so retrieval (both dense and keyword) can find
    // it even when the chunk alone lost the referent that made it relevant.
    const chunks = await addChunkContext(text, rawChunks);

    const embeddings = await embedTexts(chunks);
    const chunksRef = collection(resourceRef, "chunks");

    await Promise.all(
      chunks.map((chunkValue, index) =>
        addDoc(chunksRef, {
          text: chunkValue,
          embedding: embeddings[index],
          chunkIndex: index,
        })
      )
    );

    await updateDoc(resourceRef, {
      indexed: true,
      indexedAt: serverTimestamp(),
      chunkCount: chunks.length,
    });

    return NextResponse.json({ success: true, chunkCount: chunks.length });
  } catch (error) {
    console.error("Embed document error:", error);
    return NextResponse.json({ error: "Failed to index document." }, { status: 500 });
  }
}
