import { google } from "googleapis";
import { NextRequest } from "next/server";
import { getUidFromRequest, firestoreUpdate } from "@/src/library/googleCalendar";

export async function POST(req: NextRequest) {
  const uid = await getUidFromRequest(req);
  if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    "postmessage"
  );

  const { tokens } = await oauth2.getToken(code);

  const idToken = req.cookies.get("fb_token")?.value;
  if (!idToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

  await firestoreUpdate(idToken, "users", uid, {
    calendarTokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expiry_date: tokens.expiry_date,
      token_type: tokens.token_type,
      scope: tokens.scope,
    },
  });

  return Response.json({ connected: true });
}
