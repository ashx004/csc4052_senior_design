import { NextRequest } from "next/server";
import { getUidFromRequest, updateEvent, deleteEvent } from "@/src/library/googleCalendar";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const uid = await getUidFromRequest(req);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const body = await req.json();
  const event = await updateEvent(req, uid, eventId, body);
  return Response.json({ event });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const uid = await getUidFromRequest(req);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const success = await deleteEvent(req, uid, eventId);
  return Response.json({ success });
}
