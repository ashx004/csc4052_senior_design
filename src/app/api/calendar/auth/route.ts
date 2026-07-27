import { google } from "googleapis";
import { NextRequest } from "next/server";
import { getUidFromRequest, firestoreUpdate } from "@/src/library/googleCalendar";

export async function POST(req: NextRequest) {
  try {
    const uid = await getUidFromRequest(req);
    if (!uid) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { code } = await req.json();
    if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

    const oauth2 = new google.auth.OAuth2(
      process.env.GOOGLE_CALENDAR_CLIENT_ID,
      process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
      "postmessage"
    );

    let tokens;
    try {
      const tokenResponse = await oauth2.getToken(code);
      tokens = tokenResponse.tokens;
    } catch (tokenErr) {
      console.error("[calendar/auth] Token exchange failed:", tokenErr);
      return Response.json(
        { error: "Failed to exchange authorization code. Check that GOOGLE_CALENDAR_CLIENT_ID and GOOGLE_CALENDAR_CLIENT_SECRET match the Cloud Console." },
        { status: 400 }
      );
    }

    const idToken = req.cookies.get("fb_token")?.value;
    if (!idToken) return Response.json({ error: "Unauthorized" }, { status: 401 });

    try {
      await firestoreUpdate(idToken, "users", uid, {
        calendarTokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          expiry_date: tokens.expiry_date,
          token_type: tokens.token_type,
          scope: tokens.scope,
        },
      });
    } catch (fsErr) {
      console.error("[calendar/auth] Firestore write failed:", fsErr);
      return Response.json(
        { error: "Tokens obtained but failed to save. Check Firestore permissions." },
        { status: 500 }
      );
    }

    return Response.json({ connected: true });
  } catch (err) {
    console.error("[calendar/auth] Unexpected error:", err);
    return Response.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
