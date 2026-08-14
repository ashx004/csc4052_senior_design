import { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { createTimeoutSignal } from "./withTimeout";

// ── Firestore REST helpers (no firebase-admin / client SDK needed) ───────────
// These run in Node.js API routes, so the client-side Firebase SDK
// (firebase/firestore) cannot be used. Instead we talk to the Firestore
// REST API directly, authenticating with the user's Firebase ID token
// that arrives in the fb_token cookie.

const PROJECT_ID = "studora-933f8";
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// None of this file's fetches had any timeout at all until 2026-08-14 (same
// sweep that caught ocrClient.ts's and vectorStore.ts's) — this is the
// broadest-blast-radius instance of that pattern, since nearly every API
// route in the app goes through one of these helpers. A thin wrapper here
// covers all of them at once rather than threading a signal through every
// call site by hand.
const FIRESTORE_TIMEOUT_MS = 15_000;
function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const { signal, cancel } = createTimeoutSignal(FIRESTORE_TIMEOUT_MS, "Firestore REST call");
  return fetch(url, { ...init, signal }).finally(cancel);
}

/** Extract the uid from the fb_token cookie on a server request. */
export async function getUidFromRequest(req: NextRequest): Promise<string | null> {
  const token = req.cookies.get("fb_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Get the user's Firebase ID token from the request cookie. */
export function getIdToken(req: NextRequest): string | null {
  return req.cookies.get("fb_token")?.value ?? null;
}

/** Read a Firestore document as JSON. Returns null on failure. */
export async function firestoreGet(
  idToken: string,
  collection: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}`;
  const res = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return parseFirestoreFields(data.fields ?? {});
}

/** Write/merge fields into a Firestore document. Creates it if it doesn't exist. */
export async function firestoreUpdate(
  idToken: string,
  collection: string,
  docId: string,
  fields: Record<string, unknown>
): Promise<boolean> {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}`;
  // Firestore REST PATCH with updateMask writes only the listed fields.
  // The API requires the mask as one repeated updateMask.fieldPaths param
  // PER field, not a single comma-joined value — a comma isn't valid inside
  // a field path, so joining them made every multi-field update 400 with
  // "Invalid property path" (confirmed live 2026-08-11), silently failing
  // (see the console.error below) on every turn for any existing session.
  const params = new URLSearchParams();
  for (const key of Object.keys(fields)) {
    params.append("updateMask.fieldPaths", key);
  }
  const res = await fetchWithTimeout(`${url}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: serializeFirestoreFields(fields) }),
  });
  if (!res.ok) {
    console.error("Firestore write failed:", res.status, await res.text());
    return false;
  }
  return true;
}

/** Create a new document with an auto-generated ID. Returns that ID, or null on failure. */
export async function firestoreCreate(
  idToken: string,
  collection: string,
  fields: Record<string, unknown>
): Promise<string | null> {
  const res = await fetchWithTimeout(`${FIRESTORE_BASE}/${collection}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: serializeFirestoreFields(fields) }),
  });
  if (!res.ok) {
    console.error("Firestore create failed:", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  // data.name is like "projects/{p}/databases/(default)/documents/{collection}/{docId}"
  const name = typeof data.name === "string" ? data.name : "";
  return name.split("/").pop() || null;
}

/** Delete a document. Returns whether it succeeded. */
export async function firestoreDelete(idToken: string, collection: string, docId: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${FIRESTORE_BASE}/${collection}/${docId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) {
    console.error("Firestore delete failed:", res.status, await res.text());
    return false;
  }
  return true;
}

/** List every document in a collection, unfiltered. */
export async function firestoreListCollection(
  idToken: string,
  collectionPath: string
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const accumulated: { id: string; data: Record<string, unknown> }[] = [];
  let pageToken: string | undefined;

  while (true) {
    let url = `${FIRESTORE_BASE}/${collectionPath}?pageSize=300`;
    if (pageToken) url += `&pageToken=${encodeURIComponent(pageToken)}`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${idToken}` },
    });
    if (!res.ok) return accumulated;
    const data = await res.json();
    const documents: { name: string; fields?: Record<string, Record<string, unknown>> }[] = data.documents ?? [];
    accumulated.push(
      ...documents.map((docEntry) => ({
        id: docEntry.name.split("/").pop() || "",
        data: parseFirestoreFields(docEntry.fields ?? {}),
      }))
    );
    if (!data.nextPageToken) break;
    pageToken = data.nextPageToken;
  }

  return accumulated;
}

/** Ordered, limited query against a subcollection. */
export async function firestoreRunQuery(
  idToken: string,
  parentPath: string,
  collectionId: string,
  opts: { orderByField: string; direction?: "ASCENDING" | "DESCENDING"; limit: number }
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  const res = await fetchWithTimeout(`${FIRESTORE_BASE}/${parentPath}:runQuery`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        orderBy: [{ field: { fieldPath: opts.orderByField }, direction: opts.direction ?? "ASCENDING" }],
        limit: opts.limit,
      },
    }),
  });
  if (!res.ok) return [];
  const results: { document?: { name: string; fields?: Record<string, Record<string, unknown>> } }[] = await res.json();
  return results
    .filter((entry) => entry.document)
    .map((entry) => ({
      id: entry.document!.name.split("/").pop() || "",
      data: parseFirestoreFields(entry.document!.fields ?? {}),
    }));
}

/** Atomic multi-document write. Every write is a full-document replace-or-create — callers supply the doc ID (no auto-ID support in the REST :commit endpoint). */
export async function firestoreCommitBatch(
  idToken: string,
  writes: { path: string; fields: Record<string, unknown> }[]
): Promise<void> {
  const res = await fetchWithTimeout(`${FIRESTORE_BASE}:commit`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      writes: writes.map((w) => ({
        update: {
          name: `projects/${PROJECT_ID}/databases/(default)/documents/${w.path}`,
          fields: serializeFirestoreFields(w.fields),
        },
      })),
    }),
  });
  if (!res.ok) {
    throw new Error(`Firestore batch commit failed: ${res.status} ${await res.text()}`);
  }
}

// ── Firestore REST field format conversion ───────────────────────────────────
// Firestore REST returns/accepts values wrapped in type envelopes like
// { stringValue: "..." } or { integerValue: "123" }. These helpers
// flatten ↔ expand so the rest of the code works with plain objects.

export function parseFirestoreFields(
  fields: Record<string, Record<string, unknown>>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(fields)) {
    if ("stringValue" in val) out[key] = val.stringValue;
    else if ("integerValue" in val) out[key] = Number(val.integerValue);
    else if ("doubleValue" in val) out[key] = Number(val.doubleValue);
    else if ("booleanValue" in val) out[key] = val.booleanValue;
    else if ("timestampValue" in val) out[key] = val.timestampValue;
    else if ("nullValue" in val) out[key] = null;
    else if ("arrayValue" in val)
      out[key] = (
        (val.arrayValue as { values?: Record<string, unknown>[] }).values ?? []
      ).map((v) => parseFirestoreFields({ v })["v"]);
    else if ("mapValue" in val)
      out[key] = parseFirestoreFields(
        (val.mapValue as { fields: Record<string, Record<string, unknown>> }).fields ?? {}
      );
  }
  return out;
}

export function serializeFirestoreFields(
  obj: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, val] of Object.entries(obj)) {
    out[key] = serializeFirestoreValue(val);
  }
  return out;
}

function serializeFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (typeof val === "string") return { stringValue: val };
  if (typeof val === "number")
    return Number.isInteger(val) ? { integerValue: val } : { doubleValue: val };
  if (typeof val === "boolean") return { booleanValue: val };
  if (Array.isArray(val))
    return { arrayValue: { values: val.map(serializeFirestoreValue) } };
  if (typeof val === "object")
    return { mapValue: { fields: serializeFirestoreFields(val as Record<string, unknown>) } };
  return { nullValue: null };
}
