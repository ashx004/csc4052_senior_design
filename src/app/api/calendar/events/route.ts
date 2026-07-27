import { NextRequest } from "next/server";
import { getUidFromRequest, listEvents, createEvent, toCalendarEvent } from "@/src/library/googleCalendar";

export async function GET(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const timeMin = url.searchParams.get("timeMin") ?? undefined;
    const timeMax = url.searchParams.get("timeMax") ?? undefined;
    const timeZone = url.searchParams.get("timeZone") ?? undefined;

    const gcalEvents = await listEvents(req, uid, { timeMin, timeMax, timeZone });
    const events = gcalEvents.map(toCalendarEvent);

    return Response.json({ events });
  } catch (err) {
    console.error("[calendar/events] GET failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to fetch events", events: [] },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const event = await createEvent(req, uid, body);
    if (!event) return Response.json({ error: "Failed to create event" }, { status: 500 });

    return Response.json({ event: toCalendarEvent(event) });
  } catch (err) {
    console.error("[calendar/events] POST failed:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Failed to create event" },
      { status: 500 }
    );
  }
}
