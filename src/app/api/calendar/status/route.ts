import { NextRequest } from "next/server";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/src/library/firebase";

export async function GET(req: NextRequest) {
  const user = await verifyRequestAuth(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const userDoc = await getDoc(doc(db, "users", user.uid));
  const tokens = userDoc.data()?.calendarTokens;

  return Response.json({ connected: Boolean(tokens?.refresh_token) });
}
