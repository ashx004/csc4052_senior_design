import { collection, doc, getDoc, getDocs, query, orderBy, writeBatch, Timestamp } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import { CourseOfferingRecord, CourseOfferingSnapshot, CourseOfferingSource } from "./types";

const FIRESTORE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — the source page changes rarely, no need to re-scrape often
// This deployment is a single self-hosted Node process, not serverless/
// multi-instance (the same assumption src/library/rateLimit.ts relies on),
// so an in-process memo is a legitimate way to skip a Firestore round-trip
// on every advising page load within a short burst.
const MEMORY_TTL_MS = 5 * 60 * 1000;
// ~3,000+ courses risks Firestore's 1MiB single-document limit if stored as
// one array in one doc — split across chunk docs well under that ceiling.
const CHUNK_SIZE = 300;

type MemoryEntry = { snapshot: CourseOfferingSnapshot; expiresAt: number };
const memoryCache = new Map<string, MemoryEntry>();

async function readFirestoreCache(sourceId: string): Promise<CourseOfferingSnapshot | null> {
  const metaRef = doc(db, "courseOfferingCache", sourceId);
  const metaSnap = await getDoc(metaRef);
  if (!metaSnap.exists()) return null;

  const meta = metaSnap.data();
  const chunksRef = collection(db, "courseOfferingCache", sourceId, "chunks");
  const chunksSnap = await getDocs(query(chunksRef, orderBy("index")));
  const courses: CourseOfferingRecord[] = chunksSnap.docs.flatMap((d) => d.data().courses ?? []);

  return {
    sourceId,
    sourceUrl: meta.sourceUrl ?? "",
    fetchedAt: meta.fetchedAt?.toDate?.() ?? new Date(0),
    courses,
  };
}

async function writeFirestoreCache(snapshot: CourseOfferingSnapshot): Promise<void> {
  const chunks: CourseOfferingRecord[][] = [];
  for (let i = 0; i < snapshot.courses.length; i += CHUNK_SIZE) {
    chunks.push(snapshot.courses.slice(i, i + CHUNK_SIZE));
  }

  const batch = writeBatch(db);
  const metaRef = doc(db, "courseOfferingCache", snapshot.sourceId);
  batch.set(metaRef, {
    sourceUrl: snapshot.sourceUrl,
    fetchedAt: Timestamp.fromDate(snapshot.fetchedAt),
    courseCount: snapshot.courses.length,
    chunkCount: chunks.length,
  });

  chunks.forEach((courses, index) => {
    const chunkRef = doc(db, "courseOfferingCache", snapshot.sourceId, "chunks", `chunk_${index}`);
    batch.set(chunkRef, { index, courses });
  });

  await batch.commit();
}

// Cache-aside with a fail-open fallback: a scrape failure serves stale
// Firestore data if any exists (matching this codebase's existing
// webSearch/rerankChunks fallback style) rather than erroring the whole
// advising page over a transient issue with an external, uncontrolled page.
export async function getCourseOfferings(source: CourseOfferingSource): Promise<CourseOfferingSnapshot> {
  const now = Date.now();
  const memoized = memoryCache.get(source.id);
  if (memoized && memoized.expiresAt > now) {
    return memoized.snapshot;
  }

  let firestoreCached: CourseOfferingSnapshot | null = null;
  try {
    firestoreCached = await readFirestoreCache(source.id);
  } catch (error) {
    console.error("Failed reading course offering cache:", error);
  }

  const isStale = !firestoreCached || now - firestoreCached.fetchedAt.getTime() > FIRESTORE_TTL_MS;
  if (!isStale && firestoreCached) {
    memoryCache.set(source.id, { snapshot: firestoreCached, expiresAt: now + MEMORY_TTL_MS });
    return firestoreCached;
  }

  try {
    const fresh = await source.fetch();
    writeFirestoreCache(fresh).catch((error) => console.error("Failed writing course offering cache:", error));
    memoryCache.set(source.id, { snapshot: fresh, expiresAt: now + MEMORY_TTL_MS });
    return fresh;
  } catch (error) {
    console.error("Course offering scrape failed:", error);
    if (firestoreCached) {
      memoryCache.set(source.id, { snapshot: firestoreCached, expiresAt: now + MEMORY_TTL_MS });
      return firestoreCached;
    }
    throw error;
  }
}
