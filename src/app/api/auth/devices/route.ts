import { Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getEmailOtpConfig } from "@/src/library/authEmailOtp";
import { adminDb } from "@/src/library/firebaseAdmin";
import { checkRateLimit } from "@/src/library/rateLimit";
import { TRUSTED_DEVICE_COOKIE, readTrustedDeviceCookie } from "@/src/library/trustedDevices";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The browsers that skip the emailed sign-in code, listed for the account's owner
// (Settings > Sign-in devices) so they can see where they have signed in and remove
// any they no longer trust. Removing one makes the next sign-in there ask for a code.

const devicesOf = (uid: string) => adminDb.collection("users").doc(uid).collection("trustedDevices");
const millis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : null);

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentId = readTrustedDeviceCookie(request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value, auth.uid, getEmailOtpConfig().secret);
  const snapshot = await devicesOf(auth.uid).get();
  const devices = snapshot.docs
    .map((doc) => ({
      id: doc.id,
      label: typeof doc.get("label") === "string" ? (doc.get("label") as string) : "Browser",
      createdAt: millis(doc.get("createdAt")),
      lastSeenAt: millis(doc.get("lastSeenAt")),
      current: doc.id === currentId,
    }))
    .sort((a, b) => (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  return NextResponse.json({ devices });
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = checkRateLimit(`devices:delete:${auth.uid}`, 60_000, 20);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const params = request.nextUrl.searchParams;
  if (params.get("all") === "1") {
    const snapshot = await devicesOf(auth.uid).get();
    await Promise.all(snapshot.docs.map((doc) => doc.ref.delete()));
    return NextResponse.json({ removed: snapshot.size });
  }
  const id = params.get("id");
  if (!id || id.includes("/")) return NextResponse.json({ error: "Choose a device to remove." }, { status: 400 });
  await devicesOf(auth.uid).doc(id).delete();
  return NextResponse.json({ removed: 1 });
}
