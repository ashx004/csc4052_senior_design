import { NextRequest, NextResponse } from "next/server";
import { adminAuth } from "@/src/library/firebaseAdmin";
import { LOCAL_E2E_ADMIN_UID, LOCAL_E2E_STUDENT_UID, localE2eEnabled } from "@/src/library/e2eLocal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Delivers a Firebase custom token to Playwright's local browser. It is
 * unreachable unless the Emulator Suite runner explicitly sets E2E_LOCAL.
 * The browser still signs in through Firebase Auth Emulator and Firestore
 * still applies the normal rules.
 */
export async function POST(request: NextRequest) {
  if (!localE2eEnabled()) return new NextResponse(null, { status: 404 });

  const body = await request.json().catch(() => null) as { role?: unknown } | null;
  const uid = body?.role === "administrator"
    ? LOCAL_E2E_ADMIN_UID
    : body?.role === "student"
      ? LOCAL_E2E_STUDENT_UID
      : null;
  if (!uid) return NextResponse.json({ error: "Unknown local E2E role." }, { status: 400 });

  const customToken = await adminAuth.createCustomToken(uid);
  return NextResponse.json({ customToken }, { headers: { "Cache-Control": "no-store" } });
}
