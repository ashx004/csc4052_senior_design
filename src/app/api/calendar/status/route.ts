import { NextRequest } from "next/server";
import { getUidFromRequest, firestoreGet } from "@/src/library/googleCalendar";

export async function GET(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const idToken = req.cookies.get("fb_token")?.value;
  if (!idToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userDoc = await firestoreGet(idToken, "users", uid);
  const tokens = (userDoc?.calendarTokens as { refresh_token?: string } | undefined) ?? undefined;

  return Response.json({ connected: Boolean(tokens?.refresh_token) });
}
