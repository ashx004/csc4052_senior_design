import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/library/firebaseAdmin";
import { getObject } from "@/src/library/gcsStorage";
import { SHARE_COOKIE, hasValidShareCookie } from "@/src/library/notes/shareCookie";

export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share");
  const noteId = request.nextUrl.searchParams.get("note");
  if (!shareId || !noteId || !hasValidShareCookie(request.cookies.get(SHARE_COOKIE)?.value, shareId)) return NextResponse.json({ error: "Open the shared link first." }, { status: 401 });
  const share = await adminDb.collection("publicNoteShares").doc(shareId).get();
  const note = share.exists ? (share.data()!.notes as { id: string; url?: string }[]).find((item) => item.id === noteId) : null;
  const url = note?.url;
  const key = url ? new URL(url, request.nextUrl.origin).searchParams.get("key") : null;
  if (!key || !key.startsWith("users/")) return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  try {
    const result = await getObject(key);
    return new NextResponse(new Uint8Array(result.body), { headers: { "Content-Type": result.contentType || "application/octet-stream", "Content-Disposition": "inline" } });
  } catch { return NextResponse.json({ error: "File unavailable." }, { status: 404 }); }
}
