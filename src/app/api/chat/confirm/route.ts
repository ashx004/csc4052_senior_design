// Confirm or cancel a change the chat proposed (see src/library/pendingActions.ts).
//   POST { id, decision: "confirm" | "cancel" } -> { status, message }
//   GET  ?id=...                                 -> { status, message? }
// The GET lets a card reloaded from chat history show what already happened.

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyRequestAuth } from "@/src/library/verifyAuth";
import { getIdToken } from "@/src/library/firestoreRest";
import { getActionStatus, resolveAction } from "@/src/library/pendingActions";

const ID = z.string().regex(/^[A-Za-z0-9]{1,64}$/);
const bodySchema = z.object({ id: ID, decision: z.enum(["confirm", "cancel"]) });

async function signedIn(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  const idToken = getIdToken(request);
  return auth && idToken ? { uid: auth.uid, idToken } : null;
}

export async function POST(request: NextRequest) {
  const user = await signedIn(request);
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const result = await resolveAction(user.idToken, user.uid, parsed.data.id, parsed.data.decision);
  return NextResponse.json(result, { status: result.status === "failed" ? 409 : 200 });
}

export async function GET(request: NextRequest) {
  const user = await signedIn(request);
  if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  const id = ID.safeParse(request.nextUrl.searchParams.get("id"));
  if (!id.success) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const status = await getActionStatus(user.idToken, user.uid, id.data);
  if (!status) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(status);
}
