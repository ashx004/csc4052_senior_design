// Extract a class file's text once, reuse it everywhere. Before this, every
// chat read, quiz, flashcard set, notebook generation and course summary
// re-downloaded and re-parsed the file - and images/scans went back through
// the OCR model every single time.
//
// Keyed by the file's storage key (the ?key= in its /api/download URL). That
// key carries the upload timestamp, so a re-uploaded or re-processed file
// gets a new key and can never be served stale text.
//
// Two layers:
//   - in memory, per server process (hot files are instant);
//   - in Firestore at users/{uid}/textCache/{sha1(key)}, read and written
//     with the student's own token, so the same security rules apply and
//     the cache survives restarts. Texts too big for one document (Firestore
//     caps a document at 1 MiB) stay memory-only.

import { createHash } from "node:crypto";
import type { NextRequest } from "next/server";
import { extractDocumentText } from "./documentExtract";
import { firestoreDelete, firestoreGet, firestoreUpdate, getIdToken } from "./firestoreRest";
import { resolveInternalUrl } from "./pdfExtract";

const MEMORY_MAX_ENTRIES = 60;
const MEMORY_MAX_CHARS = 30_000_000;
const FIRESTORE_MAX_CHARS = 700_000; // leaves headroom under 1 MiB for multi-byte text

type Entry = { text: string; at: number };
const memory = new Map<string, Entry>();
let memoryChars = 0;

function remember(key: string, text: string) {
  const old = memory.get(key);
  if (old) memoryChars -= old.text.length;
  memory.delete(key);
  memory.set(key, { text, at: Date.now() });
  memoryChars += text.length;
  // Oldest first (Map keeps insertion order; reads re-insert).
  for (const [k, v] of memory) {
    if (memory.size <= MEMORY_MAX_ENTRIES && memoryChars <= MEMORY_MAX_CHARS) break;
    memory.delete(k);
    memoryChars -= v.text.length;
  }
}

/** users/{uid}/... storage key from a /api/download?key=... URL, or null. */
export function storageKeyOf(url: string): string | null {
  try {
    const key = new URL(url, "http://internal").searchParams.get("key");
    return key && /^users\/[^/]+\//.test(key) ? key : null;
  } catch {
    return null;
  }
}

const cacheDocId = (key: string) => createHash("sha1").update(key).digest("hex");
const uidOf = (key: string) => key.split("/")[1];

export const cacheStats = { memoryHits: 0, storedHits: 0, extractions: 0 };

/**
 * The text of one of the student's files: from memory, then the stored copy,
 * then a fresh extraction (which is saved for next time). `url` is the
 * file's /api/download URL; anything else is extracted without caching.
 */
export async function getDocumentText(request: NextRequest, url: string, fileType: string): Promise<string> {
  const key = storageKeyOf(url);
  const type = fileType.toLowerCase();
  if (!key) return extractDocumentText(resolveInternalUrl(request, url), type);

  const hit = memory.get(key);
  if (hit) {
    remember(key, hit.text);
    cacheStats.memoryHits++;
    return hit.text;
  }

  const idToken = getIdToken(request);
  const collection = `users/${uidOf(key)}/textCache`;
  const docId = cacheDocId(key);
  if (idToken) {
    const stored = await firestoreGet(idToken, collection, docId).catch(() => null);
    if (stored && stored.key === key && typeof stored.text === "string") {
      remember(key, stored.text);
      cacheStats.storedHits++;
      return stored.text;
    }
  }

  const text = await extractDocumentText(resolveInternalUrl(request, url), type);
  cacheStats.extractions++;
  if (text) await saveDocumentText(request, url, text, type);
  return text;
}

/** Store text already extracted elsewhere (the upload indexer does this). */
export async function saveDocumentText(request: NextRequest, url: string, text: string, fileType = ""): Promise<void> {
  const key = storageKeyOf(url);
  if (!key || !text) return;
  remember(key, text);
  const idToken = getIdToken(request);
  if (!idToken || text.length > FIRESTORE_MAX_CHARS) return;
  await firestoreUpdate(idToken, `users/${uidOf(key)}/textCache`, cacheDocId(key), {
    key,
    text,
    fileType,
    chars: text.length,
    extractedAt: new Date(),
  }).catch((error) => console.error("Saving extracted text failed (non-fatal):", error));
}

/** Forget a file's text when the file itself is deleted. */
export async function forgetDocumentText(request: NextRequest, storageKey: string): Promise<void> {
  const old = memory.get(storageKey);
  if (old) {
    memory.delete(storageKey);
    memoryChars -= old.text.length;
  }
  const idToken = getIdToken(request);
  if (idToken && /^users\/[^/]+\//.test(storageKey)) {
    await firestoreDelete(idToken, `users/${uidOf(storageKey)}/textCache`, cacheDocId(storageKey)).catch(() => false);
  }
}
