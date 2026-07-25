import { google, calendar_v3 } from "googleapis";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";
import type { CalendarEvent } from "@/src/components/calendar/calendarTypes";

type CalendarTokens = {
  access_token: string;
  refresh_token?: string;
  expiry_date?: number;
  token_type?: string;
  scope?: string;
};

export async function getCalendarClient(uid: string): Promise<calendar_v3.Calendar | null> {
  const userDoc = await getDoc(doc(db, "users", uid));
  const tokens = userDoc.data()?.calendarTokens as CalendarTokens | undefined;
  if (!tokens?.refresh_token) return null;

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET
  );
  oauth2.setCredentials({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expiry_date: tokens.expiry_date,
  });

  oauth2.on("tokens", async (newTokens) => {
    await updateDoc(doc(db, "users", uid), {
      calendarTokens: {
        ...tokens,
        access_token: newTokens.access_token,
        expiry_date: newTokens.expiry_date,
        ...(newTokens.refresh_token && { refresh_token: newTokens.refresh_token }),
      },
    });
  });

  return google.calendar({ version: "v3", auth: oauth2 });
}

export async function listEvents(
  uid: string,
  opts: { timeMin?: string; timeMax?: string; maxResults?: number } = {}
): Promise<calendar_v3.Schema$Event[]> {
  const calendar = await getCalendarClient(uid);
  if (!calendar) return [];

  const res = await calendar.events.list({
    calendarId: "primary",
    timeMin: opts.timeMin ?? new Date().toISOString(),
    timeMax: opts.timeMax,
    maxResults: opts.maxResults ?? 100,
    singleEvents: true,
    orderBy: "startTime",
  });

  return res.data.items ?? [];
}

export async function createEvent(
  uid: string,
  eventBody: calendar_v3.Schema$Event
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = await getCalendarClient(uid);
  if (!calendar) return null;

  const res = await calendar.events.insert({
    calendarId: "primary",
    requestBody: eventBody,
  });

  return res.data;
}

export async function updateEvent(
  uid: string,
  eventId: string,
  eventBody: Partial<calendar_v3.Schema$Event>
): Promise<calendar_v3.Schema$Event | null> {
  const calendar = await getCalendarClient(uid);
  if (!calendar) return null;

  const res = await calendar.events.patch({
    calendarId: "primary",
    eventId,
    requestBody: eventBody,
  });

  return res.data;
}

export async function deleteEvent(uid: string, eventId: string): Promise<boolean> {
  const calendar = await getCalendarClient(uid);
  if (!calendar) return false;

  await calendar.events.delete({ calendarId: "primary", eventId });
  return true;
}

export function toCalendarEvent(gcal: calendar_v3.Schema$Event): CalendarEvent {
  const isAllDay = Boolean(gcal.start?.date);
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
    tone: "cream",
    source: "google",
  };
}
