import { google } from "googleapis";
import { NextRequest } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";

export async function POST(req: NextRequest) {
  const user = await verifyRequestAuth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { code } = await req.json();
  if (!code) return Response.json({ error: "Missing code" }, { status: 400 });

  const oauth2 = new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    "postmessage"
  );

  const { tokens } = await oauth2.getToken(code);

  await setDoc(
    doc(db, "users", user.uid),
    {
      calendarTokens: {
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        expiry_date: tokens.expiry_date,
        token_type: tokens.token_type,
        scope: tokens.scope,
      },
    },
    { merge: true }
  );

  return Response.json({ connected: true });
}
