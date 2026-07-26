import { NextRequest } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { listEvents, createEvent, toCalendarEvent } from "@/src/library/googleCalendar";

export async function GET(req: NextRequest) {
  const user = await verifyRequestAuth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const timeMin = url.searchParams.get("timeMin") ?? undefined;
  const timeMax = url.searchParams.get("timeMax") ?? undefined;

  const gcalEvents = await listEvents(user.uid, { timeMin, timeMax });
  const events = gcalEvents.map(toCalendarEvent);

  return Response.json({ events });
}

export async function POST(req: NextRequest) {
  const user = await verifyRequestAuth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const event = await createEvent(user.uid, body);
  if (!event) return Response.json({ error: "Failed to create event" }, { status: 500 });

  return Response.json({ event: toCalendarEvent(event) });
}
