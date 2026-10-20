import { randomUUID } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { getEmailOtpConfig } from "@/src/library/authEmailOtp";
import { adminAuth, adminDb } from "@/src/library/firebaseAdmin";
import { checkRateLimit } from "@/src/library/rateLimit";
import { getRequestAuthToken, SESSION_COOKIE } from "@/src/library/requestAuthToken";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_SECONDS,
  DEVICE_SEEN_INTERVAL_MS,
  TRUSTED_DEVICE_COOKIE,
  describeDevice,
  isDeviceId,
  readTrustedDeviceCookie,
  signInMethod,
} from "@/src/library/trustedDevices";
import { verifyRequestAuth } from "@/src/library/verifyAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Settings > Sign-in devices: every browser this account has signed in on
// (any method), when it was first and last active, how it signed in, and
// whether it skips the emailed code. Removing one also ends that skip, so the
// next password sign-in there asks for a code again.

const userRef = (uid: string) => adminDb.collection("users").doc(uid);
const millis = (value: unknown) => (value instanceof Timestamp ? value.toMillis() : null);

/** Called by the browser while the student uses the site (AuthContext): records or refreshes this device. */
export async function POST(request: NextRequest) {
  const token = getRequestAuthToken({ cookie: request.cookies.get(SESSION_COOKIE)?.value, authorization: request.headers.get("authorization") });
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let decoded;
  try {
    decoded = await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const uid = decoded.uid;
  const limit = checkRateLimit(`devices:seen:${uid}`, 60_000, 6);
  if (!limit.allowed) return NextResponse.json({ ok: true });

  const existingId = request.cookies.get(DEVICE_COOKIE)?.value;
  const deviceId = isDeviceId(existingId) ? existingId : randomUUID();
  const trustedId = readTrustedDeviceCookie(request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value, uid, getEmailOtpConfig().secret);
  const ref = userRef(uid).collection("signInDevices").doc(deviceId);
  const snap = await ref.get();
  const lastSeen = millis(snap.get("lastSeenAt")) ?? 0;
  if (!snap.exists || Date.now() - lastSeen > DEVICE_SEEN_INTERVAL_MS || (trustedId && snap.get("trustedDeviceId") !== trustedId)) {
    await ref.set(
      {
        label: describeDevice(request.headers.get("user-agent")),
        method: signInMethod(decoded.firebase?.sign_in_provider),
        lastSeenAt: FieldValue.serverTimestamp(),
        ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
        ...(trustedId ? { trustedDeviceId: trustedId } : {}),
      },
      { merge: true }
    );
    if (trustedId) await userRef(uid).collection("trustedDevices").doc(trustedId).update({ lastSeenAt: FieldValue.serverTimestamp() }).catch(() => undefined);
  }

  const response = NextResponse.json({ ok: true });
  if (deviceId !== existingId) {
    response.cookies.set(DEVICE_COOKIE, deviceId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/api/auth",
      maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
    });
  }
  return response;
}

export async function GET(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const currentDevice = request.cookies.get(DEVICE_COOKIE)?.value;
  const currentTrusted = readTrustedDeviceCookie(request.cookies.get(TRUSTED_DEVICE_COOKIE)?.value, auth.uid, getEmailOtpConfig().secret);
  const [seen, trusted] = await Promise.all([userRef(auth.uid).collection("signInDevices").get(), userRef(auth.uid).collection("trustedDevices").get()]);
  const trustedIds = new Set(trusted.docs.map((d) => d.id));
  const linked = new Set<string>();

  const devices = seen.docs.map((doc) => {
    const trustedDeviceId = typeof doc.get("trustedDeviceId") === "string" ? (doc.get("trustedDeviceId") as string) : null;
    if (trustedDeviceId) linked.add(trustedDeviceId);
    return {
      id: doc.id,
      label: typeof doc.get("label") === "string" ? (doc.get("label") as string) : "Browser",
      method: typeof doc.get("method") === "string" ? (doc.get("method") as string) : null,
      createdAt: millis(doc.get("createdAt")),
      lastSeenAt: millis(doc.get("lastSeenAt")),
      skipsCode: Boolean(trustedDeviceId && trustedIds.has(trustedDeviceId)),
      current: doc.id === currentDevice,
    };
  });
  // Trusted browsers from before signInDevices existed (or not visited since).
  for (const doc of trusted.docs) {
    if (linked.has(doc.id)) continue;
    devices.push({
      id: `trusted:${doc.id}`,
      label: typeof doc.get("label") === "string" ? (doc.get("label") as string) : "Browser",
      method: "Password",
      createdAt: millis(doc.get("createdAt")),
      lastSeenAt: millis(doc.get("lastSeenAt")),
      skipsCode: true,
      current: doc.id === currentTrusted && !devices.some((d) => d.current),
    });
  }
  devices.sort((a, b) => Number(b.current) - Number(a.current) || (b.lastSeenAt ?? 0) - (a.lastSeenAt ?? 0));
  return NextResponse.json({ devices });
}

export async function DELETE(request: NextRequest) {
  const auth = await verifyRequestAuth(request);
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = checkRateLimit(`devices:delete:${auth.uid}`, 60_000, 20);
  if (!limit.allowed) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const seen = userRef(auth.uid).collection("signInDevices");
  const trusted = userRef(auth.uid).collection("trustedDevices");
  const params = request.nextUrl.searchParams;
  if (params.get("all") === "1") {
    const [a, b] = await Promise.all([seen.get(), trusted.get()]);
    await Promise.all([...a.docs, ...b.docs].map((doc) => doc.ref.delete()));
    return NextResponse.json({ removed: a.size + b.size });
  }
  const id = params.get("id");
  if (!id || id.includes("/")) return NextResponse.json({ error: "Choose a device to remove." }, { status: 400 });
  if (id.startsWith("trusted:")) {
    await trusted.doc(id.slice("trusted:".length)).delete();
    return NextResponse.json({ removed: 1 });
  }
  const doc = await seen.doc(id).get();
  const trustedDeviceId = doc.get("trustedDeviceId");
  await Promise.all([seen.doc(id).delete(), typeof trustedDeviceId === "string" ? trusted.doc(trustedDeviceId).delete() : Promise.resolve()]);
  return NextResponse.json({ removed: 1 });
}
