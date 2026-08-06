// Server-only: talks to the Qdrant instance on the primary GPU box
// (co-located there per an explicit infra decision to keep heavy/persistent
// services off the already-loaded secondary box, even though the app itself
// runs on secondary — the LAN hop this costs is ~20-30ms, negligible next
// to what it replaces: brute-force per-search Firestore chunk fetches with
// cosine similarity computed in JS, no ANN index, that got slower as a
// student's document count grew).
//
// This is the fast search index only — Firestore's chunks subcollection
// remains the source of truth for chunk existence/metadata (used by the
// document-management UI); Qdrant just needs enough payload to answer a
// search and resolve back to a document (see searchDocuments in
// api/chat/route.ts, which maps results back to docName/classCode via its
// own already-loaded candidateDocs list).
import { createHash } from "crypto";
import { probeUrl, resolveReachableUrl } from "./resolveReachableUrl";

const COLLECTION = "catalyst_chunks";

// Qdrant only accepts an unsigned integer or a UUID as a point ID — not an
// arbitrary string like a Firestore resourceId (confirmed live: it 400s
// otherwise). Deterministic UUID v5 (namespace + name) so the same chunk
// always maps to the same point id — upserts stay idempotent (re-indexing a
// resource overwrites its existing points rather than duplicating them),
// with no need to track IDs anywhere ourselves.
const NAMESPACE = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");
export function chunkPointId(resourceId: string, chunkIndex: number): string {
  const hash = createHash("sha1")
    .update(Buffer.concat([NAMESPACE, Buffer.from(`${resourceId}_${chunkIndex}`)]))
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export type ChunkPoint = {
  id: string | number;
  vector: number[];
  payload: {
    userId: string;
    courseId: string;
    resourceId: string;
    chunkIndex: number;
    text: string;
  };
};

export type ChunkSearchResult = {
  score: number;
  payload: ChunkPoint["payload"];
};

// LAN-direct when reachable, falling back to the public tunneled URL
// (QDRANT_FALLBACK_URL) for callers off the home/school LAN — same
// primary/fallback pattern as ollamaClient.ts and minioClient.ts.
async function baseUrl(): Promise<string> {
  if (!process.env.QDRANT_URL) throw new Error("QDRANT_URL is not configured.");
  const headers = process.env.QDRANT_API_KEY ? { "api-key": process.env.QDRANT_API_KEY } : undefined;
  return resolveReachableUrl(process.env.QDRANT_URL, process.env.QDRANT_FALLBACK_URL, (url) =>
    probeUrl(url, "/", headers)
  );
}

function headers(): HeadersInit {
  return {
    "Content-Type": "application/json",
    ...(process.env.QDRANT_API_KEY ? { "api-key": process.env.QDRANT_API_KEY } : {}),
  };
}

export async function upsertChunks(points: ChunkPoint[]): Promise<void> {
  if (points.length === 0) return;

  const response = await fetch(`${await baseUrl()}/collections/${COLLECTION}/points`, {
    method: "PUT",
    headers: headers(),
    body: JSON.stringify({ points }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Qdrant upsert failed (${response.status}): ${text}`);
  }
}

export async function searchChunks(
  queryVector: number[],
  filter: { userId: string; resourceIds: string[] },
  limit: number
): Promise<ChunkSearchResult[]> {
  if (filter.resourceIds.length === 0) return [];

  const response = await fetch(`${await baseUrl()}/collections/${COLLECTION}/points/search`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      vector: queryVector,
      limit,
      with_payload: true,
      filter: {
        must: [
          { key: "userId", match: { value: filter.userId } },
          { key: "resourceId", match: { any: filter.resourceIds } },
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Qdrant search failed (${response.status}): ${text}`);
  }

  const data = await response.json();
  return (data?.result ?? []).map((r: any) => ({ score: r.score, payload: r.payload }));
}

export async function deleteChunksForResource(userId: string, resourceId: string): Promise<void> {
  const response = await fetch(`${await baseUrl()}/collections/${COLLECTION}/points/delete`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      filter: {
        must: [
          { key: "userId", match: { value: userId } },
          { key: "resourceId", match: { value: resourceId } },
        ],
      },
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    console.error(`Qdrant delete failed (${response.status}): ${text}`);
  }
}
