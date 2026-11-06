// The real dependencies for resolveSources, wired once for every route.
//
// resolveSources takes its Qdrant, Ollama and Firestore access by injection
// so it can be unit-tested without them. This is the single place the live
// implementations are supplied, so the flashcard, quiz and notebook routes
// cannot drift apart on either the Firestore path or the error policy below.

import type { NextRequest } from "next/server";

import { adminDb } from "@/src/library/firebaseAdmin";
import { embedTexts } from "@/src/library/ollamaEmbeddings";
import { searchChunks } from "@/src/library/vectorStore";
import { getDocumentText } from "@/src/library/documentTextCache";
import type { IndexStatus, ResolveDeps } from "./resolveSources";

const INDEX_STATUSES: readonly string[] = ["queued", "processing", "complete", "failed"];

/**
 * A resource's index state lives at
 * users/{uid}/enrollment/{courseId}/resources/{resourceId} (the path
 * embed-document writes, see embed-document/route.ts:268), so reading it
 * needs courseId as well as the resource id.
 *
 * Any failure — missing courseId, missing doc, Firestore error — returns
 * undefined, which resolveSources reads as "not indexed" and handles with
 * the raw-text fallback. An unknown status must never fail a generation.
 */
export function resolveDepsFor(request: NextRequest, uid: string, courseId: string | undefined): ResolveDeps {
  return {
    uid,
    readText: (url: string, fileType: string) => getDocumentText(request, url, fileType),
    indexStatusOf: async (resourceId: string) => {
      if (!courseId) return undefined;
      try {
        const snap = await adminDb.doc(`users/${uid}/enrollment/${courseId}/resources/${resourceId}`).get();
        const status = snap.data()?.indexStatus;
        return typeof status === "string" && INDEX_STATUSES.includes(status) ? (status as IndexStatus) : undefined;
      } catch (error) {
        console.warn(`Could not read indexStatus for ${resourceId}:`, error);
        return undefined;
      }
    },
    /**
     * The legacy { docUrl, docName } request shape carries no resourceId, so without
     * this lookup those callers — the study plan's practice generators above all —
     * could never reach retrieval and re-downloaded and re-parsed the whole file on
     * every Start. Resources are written with exactly this url (fileUploadService),
     * so an equality match is enough. Any failure returns null, which resolveSources
     * reads as "not indexed": a lookup must never fail a generation.
     */
    resourceIdForUrl: async (url: string) => {
      if (!courseId || !url) return null;
      try {
        const snap = await adminDb
          .collection(`users/${uid}/enrollment/${courseId}/resources`)
          .where("url", "==", url)
          .limit(1)
          .get();
        return snap.docs[0]?.id ?? null;
      } catch (error) {
        console.warn(`Could not look up the resource for ${url}:`, error);
        return null;
      }
    },
    embed: (texts: string[]) => embedTexts(texts),
    search: searchChunks,
  };
}

/** The optional courseId a request may carry so retrieval can locate resources. */
export function courseIdFromBody(body: unknown): string | undefined {
  const courseId = (body as { courseId?: unknown } | null)?.courseId;
  return typeof courseId === "string" && courseId ? courseId : undefined;
}
