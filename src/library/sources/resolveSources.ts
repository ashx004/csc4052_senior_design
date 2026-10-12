// Turns the sources a student ticked into budgeted text per source.
//
// Dependencies are injected rather than imported so this is unit-testable
// without Qdrant, Ollama or MinIO. The route wires the real ones.

import { selectChunks, type ChunkCandidate } from "@/src/library/generation/selectChunks";
import { SourceSelectionError } from "./errors";
import { isTextSource, type ResolvedSource, type ResolveResult, type SkippedSource, type SourceInput } from "./sourceTypes";

/** Characters of source text per generation call (~8-12k tokens at 4 chars/token). */
export const PER_SOURCE_CHAR_BUDGET = 48_000;

/** How many sources one set may be built from. */
export const MAX_SOURCES = 10;

/** How many chunks to ask Qdrant for before diversity selection narrows them. */
const RETRIEVAL_LIMIT = 60;

export type IndexStatus = "queued" | "processing" | "complete" | "failed";

export type ResolveDeps = {
  uid: string;
  /** Raw text extraction fallback — wraps getDocumentText. */
  readText(url: string, fileType: string): Promise<string>;
  /** Firestore lookup of a resource's vector index state. */
  indexStatusOf(resourceId: string): Promise<IndexStatus | undefined>;
  /** Embedding for the pseudo-query — wraps embedTexts. */
  embed(texts: string[]): Promise<number[][]>;
  /** Qdrant search — wraps searchChunks. The options argument is how chunk
   *  vectors are requested; without them diversity selection cannot work. */
  search(
    vector: number[],
    filter: { userId: string; resourceIds: string[] },
    limit: number,
    options?: { withVectors?: boolean }
  ): Promise<Array<{ score: number; payload: { text: string; rawText?: string; page?: number }; vector?: number[] }>>;
};

/** Only the caller's own files. Both URL encodings are accepted, as the routes do today. */
export function ownsUrl(url: string, uid: string): boolean {
  if (!url) return false;
  return (
    url.startsWith(`/api/download?key=users%2F${uid}%2F`) || url.startsWith(`/api/download?key=users/${uid}/`)
  );
}

/** The storage key a download URL points at, used for set identity. */
function storageKeyOf(url: string): string | null {
  const match = /[?&]key=([^&]+)/.exec(url);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    // Malformed percent-encoding (URIError). ownsUrl is prefix-only, so such a
    // url can reach here; degrade to "no key" so one oddly named file cannot
    // fail the whole request. dedupeSources then keys on the raw url.
    return null;
  }
}

/**
 * One entry per distinct file. A document note points at the same class
 * resource as the document itself and carries the same url, so a student
 * who ticks both would otherwise pay the text budget twice and get
 * duplicate questions.
 */
export function dedupeSources(sources: SourceInput[]): SourceInput[] {
  const seen = new Set<string>();
  const out: SourceInput[] = [];
  for (const source of sources) {
    if (isTextSource(source)) {
      out.push(source);
      continue;
    }
    const key = storageKeyOf(source.url) ?? source.url;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(source);
  }
  return out;
}

export async function resolveSources(
  deps: ResolveDeps,
  input: SourceInput[],
  /** Per-source character budget. Overridable so tests can use small fixtures. */
  budget: number = PER_SOURCE_CHAR_BUDGET
): Promise<ResolveResult> {
  if (input.length === 0) return { sources: [], skipped: [] };
  if (input.length > MAX_SOURCES) {
    throw new SourceSelectionError(`Pick at most ${MAX_SOURCES} documents or notes for one study set.`);
  }

  const sources: ResolvedSource[] = [];
  const skipped: SkippedSource[] = [];

  for (const source of dedupeSources(input)) {
    const title = (source.title || "Untitled").slice(0, 200);

    if (isTextSource(source)) {
      const text = source.text.trim().slice(0, budget);
      if (!text) {
        skipped.push({ title, reason: "no-text" });
        continue;
      }
      sources.push({ title, resourceId: null, sourceKey: null, text, pages: [], viaRetrieval: false });
      continue;
    }

    if (!ownsUrl(source.url, deps.uid)) {
      skipped.push({ title, reason: "not-owned" });
      continue;
    }

    const resolved = await resolveDocument(deps, source, title, budget);
    if ("reason" in resolved) skipped.push({ title, reason: resolved.reason });
    else sources.push(resolved);
  }

  return { sources, skipped };
}

async function resolveDocument(
  deps: ResolveDeps,
  source: { title: string; url: string; fileType: string; resourceId?: string },
  title: string,
  budget: number
): Promise<ResolvedSource | { reason: string }> {
  const sourceKey = storageKeyOf(source.url);

  // Retrieval reaches content raw truncation cannot: embed-document indexes
  // up to 100k chars per document while a single prompt only ever carried
  // the first 50k.
  if (source.resourceId) {
    try {
      const status = await deps.indexStatusOf(source.resourceId);
      if (status === "complete") {
        const retrieved = await retrieve(deps, source.resourceId, title, budget);
        if (retrieved && retrieved.text.trim()) {
          return {
            title,
            resourceId: source.resourceId,
            sourceKey,
            text: retrieved.text,
            pages: retrieved.pages,
            viaRetrieval: true,
          };
        }
      }
    } catch (error) {
      console.warn(`Retrieval failed for ${title}, falling back to raw text:`, error);
    }
  }

  // A freshly uploaded lecture is not indexed yet, so this path is normal,
  // not exceptional.
  let raw: string;
  try {
    raw = await deps.readText(source.url, source.fileType);
  } catch (error) {
    // The skip reason reaches the client, but a storage outage or a corrupt
    // file is an operational problem and the only record of it is here — the
    // routes that used to log this no longer read documents themselves.
    console.error(`Could not read source "${title}" (.${source.fileType}):`, error);
    return { reason: "unreadable" };
  }
  const text = raw.trim().slice(0, budget);
  if (!text) return { reason: "no-text" };

  return {
    title,
    resourceId: source.resourceId ?? null,
    sourceKey,
    text,
    pages: [],
    viaRetrieval: false,
  };
}

async function retrieve(
  deps: ResolveDeps,
  resourceId: string,
  title: string,
  budget: number
): Promise<{ text: string; pages: number[] } | null> {
  // Question generation has no natural query, so the document's own title
  // stands in as the pseudo-query and diversity selection does the rest.
  const [vector] = await deps.embed([title]);
  if (!vector) return null;

  // withVectors is load-bearing, not an optimization: selectChunks measures
  // redundancy by cosine distance between chunk vectors, so without them
  // every candidate scores redundancy 0 and selection silently collapses
  // into plain score order.
  const hits = await deps.search(
    vector,
    { userId: deps.uid, resourceIds: [resourceId] },
    RETRIEVAL_LIMIT,
    { withVectors: true }
  );
  if (hits.length === 0) return null;

  const candidates: ChunkCandidate[] = hits.map((hit) => ({
    // rawText is the original evidence; text carries generated retrieval
    // context, which must never become the thing a question is "grounded" in.
    text: hit.payload.rawText ?? hit.payload.text,
    page: hit.payload.page,
    score: hit.score,
    vector: hit.vector,
  }));

  const picked = selectChunks(candidates, budget);
  if (picked.length === 0) return null;

  const pages = [...new Set(picked.map((c) => c.page).filter((p): p is number => typeof p === "number"))].sort(
    (a, b) => a - b
  );
  return { text: picked.map((c) => c.text).join("\n\n"), pages };
}
