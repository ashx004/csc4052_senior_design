import { NextRequest } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { updateEvent, deleteEvent } from "@/src/library/googleCalendar";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const user = await verifyRequestAuth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const event = await updateEvent(user.uid, params.eventId, body);
  return Response.json({ event });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { eventId: string } }
) {
  const user = await verifyRequestAuth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const success = await deleteEvent(user.uid, params.eventId);
  return Response.json({ success });
}
