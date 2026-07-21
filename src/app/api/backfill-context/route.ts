import { NextRequest, NextResponse } from "next/server";
import { collectionGroup, getDocs, collection, addDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { resolveInternalUrl } from "@/src/library/pdfExtract";
import { extractDocumentText, SUPPORTED_DOCUMENT_TYPES } from "@/src/library/documentExtract";
import { chunkText } from "@/src/library/chunking";
import { addChunkContext } from "@/src/library/contextualChunking";
import { embedTexts } from "@/src/library/ollamaEmbeddings";

// TEMPORARY, one-off migration route — indexes every resource that either
// was never indexed (the real bug: uploads' fire-and-forget indexing fetch
// was getting cancelled by page navigation before it could finish, fixed in
// fileUploadService.ts) or was indexed before Contextual Retrieval existed.
// Delete this file once it's been run.
// ?dryRun=1 just reports what it would do, without touching any data.
export async function POST(request: NextRequest) {
  const dryRun = request.nextUrl.searchParams.get("dryRun") === "1";

  const snap = await getDocs(collectionGroup(db, "resources"));

  if (request.nextUrl.searchParams.get("inspect") === "1") {
    return NextResponse.json({
      total: snap.size,
      sample: snap.docs.slice(0, 10).map((d) => ({ id: d.id, path: d.ref.path, ...d.data() })),
    });
  }

  // ?retryFailuresOnly=1: only process resources not already successfully
  // indexed — for re-running after a partial failure without redoing work.
  const retryFailuresOnly = request.nextUrl.searchParams.get("retryFailuresOnly") === "1";
  const candidates = retryFailuresOnly ? snap.docs.filter((d) => d.data().indexed !== true) : snap.docs;

  const results: any[] = [];

  for (const resourceSnap of candidates) {
    const resource = resourceSnap.data();
    const resourceRef = resourceSnap.ref;

    if (!SUPPORTED_DOCUMENT_TYPES.includes(resource.fileType)) {
      results.push({ id: resourceSnap.id, name: resource.name, status: "skipped", reason: "unsupported type" });
      continue;
    }

    if (dryRun) {
      results.push({ id: resourceSnap.id, name: resource.name, fileType: resource.fileType, status: "would-reindex" });
      continue;
    }

    try {
      const fullUrl = resolveInternalUrl(request, resource.url);
      const text = await extractDocumentText(fullUrl, resource.fileType);
      const rawChunks = chunkText(text);

      if (rawChunks.length === 0) {
        results.push({ id: resourceSnap.id, name: resource.name, status: "skipped", reason: "no extractable text" });
        continue;
      }

      const chunks = await addChunkContext(text, rawChunks);
      const embeddings = await embedTexts(chunks);

      const chunksRef = collection(resourceRef, "chunks");
      const oldChunksSnap = await getDocs(chunksRef);

      // Write the new contextualized chunks first, then remove the old
      // ones — a failure partway through leaves the old (still-working)
      // chunks intact rather than leaving the resource with none.
      await Promise.all(
        chunks.map((chunkValue, index) =>
          addDoc(chunksRef, { text: chunkValue, embedding: embeddings[index], chunkIndex: index })
        )
      );
      await Promise.all(oldChunksSnap.docs.map((d) => deleteDoc(d.ref)));

      await updateDoc(resourceRef, {
        indexed: true,
        indexedAt: serverTimestamp(),
        chunkCount: chunks.length,
        reindexedAt: serverTimestamp(),
      });

      results.push({
        id: resourceSnap.id,
        name: resource.name,
        status: "reindexed",
        oldChunkCount: oldChunksSnap.size,
        newChunkCount: chunks.length,
      });
    } catch (error: any) {
      results.push({ id: resourceSnap.id, name: resource.name, status: "error", error: error?.message });
    }
  }

  return NextResponse.json({ totalResourcesScanned: snap.size, results });
}
