import { GetObjectCommand } from "@aws-sdk/client-s3";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/library/firebaseAdmin";
import { getMinioClient } from "@/src/library/minioClient";

export async function GET(request: NextRequest) {
  const shareId = request.nextUrl.searchParams.get("share");
  const noteId = request.nextUrl.searchParams.get("note");
  if (!shareId || !noteId || request.cookies.get("note_share_access")?.value !== shareId) return NextResponse.json({ error: "Open the shared link first." }, { status: 401 });
  const share = await adminDb.collection("publicNoteShares").doc(shareId).get();
  const note = share.exists ? (share.data()!.notes as { id: string; url?: string }[]).find((item) => item.id === noteId) : null;
  const url = note?.url;
  const key = url ? new URL(url, request.nextUrl.origin).searchParams.get("key") : null;
  if (!key || !key.startsWith("users/")) return NextResponse.json({ error: "File unavailable." }, { status: 404 });
  try {
    const result = await (await getMinioClient()).send(new GetObjectCommand({ Bucket: "studora", Key: key }));
    return new NextResponse(Buffer.from(await result.Body!.transformToByteArray()), { headers: { "Content-Type": result.ContentType || "application/octet-stream", "Content-Disposition": "inline" } });
  } catch { return NextResponse.json({ error: "File unavailable." }, { status: 404 }); }
}
