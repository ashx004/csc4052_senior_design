import { NextRequest } from "next/server";
import { getUidFromRequest } from "@/src/library/firestoreRest";
import { updateEvent, deleteEvent } from "@/src/library/googleCalendar";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ eventId: string }> }
) {
  const uid = await getUidFromRequest(req);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { eventId } = await params;
  const body = await req.json();
  try {
    const event = await updateEvent(req, uid, eventId, body);
    if (!event) return Response.json({ error: "not_connected" }, { status: 409 });
    return Response.json({ event });
  } catch (err) {
    const e = err as { code?: number | string; response?: { status?: number }; message?: string };
    const status = Number(e.response?.status ?? e.code);
    if (status === 404 || status === 410) {
      return Response.json({ error: "not_found" }, { status: 404 });
    }
    return Response.json({ error: e.message ?? "Update failed" }, { status: 500 });
  }
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
