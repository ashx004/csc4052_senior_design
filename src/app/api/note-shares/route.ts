import { randomBytes, scryptSync, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/src/library/firebaseAdmin";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

const hashPassword = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");
const publicNote = (id: string, data: FirebaseFirestore.DocumentData) => ({ id, kind: data.kind, title: data.title, plainText: data.plainText ?? "", fileType: data.fileType ?? "", url: data.annotatedUrl || data.url || null, scan: data.scan === true });

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null) as { action?: string; type?: "note" | "notebook"; id?: string; password?: string } | null;
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  if (body.action === "access") {
    const share = await adminDb.collection("publicNoteShares").doc(body.id ?? "").get();
    if (!share.exists) return NextResponse.json({ error: "This share link is unavailable." }, { status: 404 });
    const data = share.data()!;
    if (data.passwordHash) {
      const candidate = hashPassword(body.password ?? "", data.passwordSalt);
      if (!timingSafeEqual(Buffer.from(candidate, "hex"), Buffer.from(data.passwordHash, "hex"))) return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }
    const response = NextResponse.json({ title: data.title, type: data.type, notes: data.notes });
    // This short-lived browser session permits file links after the visitor
    // has supplied the optional password; it grants access only to this share.
    response.cookies.set("note_share_access", body.id ?? "", { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24, path: "/" });
    return response;
  }
  const auth = await verifyRequestAuth(request);
  if (!auth || (body.type !== "note" && body.type !== "notebook") || !body.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = adminDb.collection("users").doc(auth.uid);
  let title = "Untitled note";
  let notes: object[] = [];
  if (body.type === "note") {
    const note = await user.collection("notes").doc(body.id).get();
    if (!note.exists) return NextResponse.json({ error: "Note not found." }, { status: 404 });
    title = note.data()!.title ?? title;
    notes = [publicNote(note.id, note.data()!)];
  } else {
    const notebook = await user.collection("notebooks").doc(body.id).get();
    if (!notebook.exists) return NextResponse.json({ error: "Notebook not found." }, { status: 404 });
    title = notebook.data()!.name ?? "Untitled notebook";
    const noteDocs = await user.collection("notes").where("notebookId", "==", body.id).get();
    notes = noteDocs.docs.filter((note) => !note.data().hidden).map((note) => publicNote(note.id, note.data()));
  }
  const id = randomBytes(18).toString("base64url");
  const salt = body.password?.trim() ? randomBytes(16).toString("hex") : null;
  await adminDb.collection("publicNoteShares").doc(id).set({ ownerUid: auth.uid, title, type: body.type, notes, passwordSalt: salt, passwordHash: salt ? hashPassword(body.password!.trim(), salt) : null, createdAt: new Date() });
  return NextResponse.json({ id });
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  const share = id ? await adminDb.collection("publicNoteShares").doc(id).get() : null;
  if (!share?.exists) return NextResponse.json({ error: "This share link is unavailable." }, { status: 404 });
  const data = share.data()!;
  return NextResponse.json({ title: data.title, type: data.type, passwordRequired: Boolean(data.passwordHash) });
}
