import { google, calendar_v3 } from "googleapis";
import { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

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
function getIdToken(req: NextRequest): string | null {
  return req.cookies.get("fb_token")?.value ?? null;
}

/** Read a Firestore document as JSON. Returns null on failure. */
export async function firestoreGet(
  idToken: string,
  collection: string,
  docId: string
): Promise<Record<string, unknown> | null> {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return parseFirestoreFields(data.fields ?? {});
}

/** Write/merge fields into a Firestore document. */
export async function firestoreUpdate(
  idToken: string,
  collection: string,
  docId: string,
  fields: Record<string, unknown>
): Promise<void> {
  const url = `${FIRESTORE_BASE}/${collection}/${docId}`;
  // Firestore REST PATCH with updateMask writes only the listed fields.
  const mask = Object.keys(fields).join(",");
  const res = await fetch(`${url}?updateMask.fieldPaths=${mask}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${idToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields: serializeFirestoreFields(fields) }),
  });
  if (!res.ok) {
    console.error("Firestore write failed:", res.status, await res.text());
  }
}

// ── Firestore REST field format conversion ───────────────────────────────────
// Firestore REST returns/accepts values wrapped in type envelopes like
// { stringValue: "..." } or { integerValue: "123" }. These helpers
// flatten ↔ expand so the rest of the code works with plain objects.

function parseFirestoreFields(
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
    else if ("mapValue" in val)
      out[key] = parseFirestoreFields(
        (val.mapValue as { fields: Record<string, Record<string, unknown>> }).fields ?? {}
      );
  }
  return out;
}

function serializeFirestoreFields(
  obj: Record<string, unknown>
): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val === null || val === undefined) out[key] = { nullValue: null };
    else if (typeof val === "string") out[key] = { stringValue: val };
    else if (typeof val === "number")
      out[key] = Number.isInteger(val)
        ? { integerValue: val }
        : { doubleValue: val };
    else if (typeof val === "boolean") out[key] = { booleanValue: val };
    else if (typeof val === "object")
      out[key] = { mapValue: { fields: serializeFirestoreFields(val as Record<string, unknown>) } };
  }
  return out;
}

// ── Token & calendar client management ───────────────────────────────────────

type CalendarTokens = {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
};

/**
 * Read the user's stored Google Calendar OAuth tokens from Firestore
 * and build an authenticated calendar_v3.Calendar client.
 * Automatically persists refreshed access tokens back to Firestore.
 */
export async function getCalendarClient(
  req: NextRequest,
  uid: string
): Promise<{ calendar: calendar_v3.Calendar; idToken: string } | null> {
  const idToken = getIdToken(req);
  if (!idToken) {
    console.warn("[googleCalendar] No fb_token cookie — cannot build calendar client");
    return null;
  }

  const userDoc = await firestoreGet(idToken, "users", uid);
  const tokens = (userDoc?.calendarTokens as CalendarTokens | undefined) ?? undefined;
  if (!tokens?.refresh_token) {
    console.warn(`[googleCalendar] No calendarTokens.refresh_token for uid=${uid}`);
    return null;
  }

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  // When the access token is refreshed, persist the new tokens to Firestore.
  oauth2.on("tokens", async (newTokens) => {
    const updated: CalendarTokens = {
      ...tokens,
      access_token: newTokens.access_token ?? tokens.access_token,
      expiry_date: newTokens.expiry_date ?? tokens.expiry_date,
    };
    if (newTokens.refresh_token) updated.refresh_token = newTokens.refresh_token;
    await firestoreUpdate(idToken, "users", uid, { calendarTokens: updated });
  });

  const calendar = google.calendar({ version: "v3", auth: oauth2 });
  return { calendar, idToken };
}

// ── Public CRUD helpers ──────────────────────────────────────────────────────

export async function listEvents(
  req: NextRequest,
  uid: string,
  opts: { timeMin?: string; timeMax?: string; maxResults?: number; timeZone?: string } = {}
): Promise<calendar_v3.Schema$Event[]> {
  const client = await getCalendarClient(req, uid);
  if (!client) return [];

  const res = await client.calendar.events.list({
    calendarId: "primary",
    timeMin: opts.timeMin ?? new Date().toISOString(),
    timeMax: opts.timeMax,
    maxResults: opts.maxResults ?? 250,
    singleEvents: true,
    orderBy: "startTime",
    timeZone: opts.timeZone,
  });

  return res.data.items ?? [];
}

export async function createEvent(
  req: NextRequest,
  uid: string,
  eventBody: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event | null> {
  const client = await getCalendarClient(req, uid);
  if (!client) return null;

  const res = await client.calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
  });

  return res.data;
}

export async function updateEvent(
  req: NextRequest,
  uid: string,
  eventId: string,
  eventBody: Partial<calendar_v3.Schema$Event>
): Promise<calendar_v3.Schema$Event | null> {
  const client = await getCalendarClient(req, uid);
  if (!client) return null;

  const res = await client.calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: eventBody,
  });

  return res.data;
}

export async function deleteEvent(
  req: NextRequest,
  uid: string,
  eventId: string
): Promise<boolean> {
  const client = await getCalendarClient(req, uid);
  if (!client) return false;

  await client.calendar.events.delete({ calendarId: "primary", eventId });
  return true;
}

// ── Type conversion ──────────────────────────────────────────────────────────

const TONE_POOL: CalendarEvent["tone"][] = [
  "cream", "sage", "rose", "lavender", "blue", "brown",
];

/** Convert a Google Calendar event to the app's unified CalendarEvent type. */
export function toCalendarEvent(gcal: calendar_v3.Schema$Event): CalendarEvent {
  const isAllDay = Boolean(gcal.start?.date);
  // Deterministic tone from event ID so the same event keeps its color.
  const hash = (gcal.id ?? "").split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const tone = TONE_POOL[Math.abs(hash) % TONE_POOL.length];

  return {
    id: gcal.id ?? crypto.randomUUID(),
    title: gcal.summary ?? "(No title)",
    description: gcal.description ?? undefined,
    location: gcal.location ?? undefined,
    startTime: gcal.start?.dateTime ?? gcal.start?.date ?? "",
    endTime: gcal.end?.dateTime ?? gcal.end?.date ?? "",
    allDay: isAllDay,
    timeZone: gcal.start?.timeZone ?? undefined,
    status: (gcal.status as CalendarEvent["status"]) ?? "confirmed",
    htmlLink: gcal.htmlLink ?? undefined,
    tone,
    source: "google",
  };
}
