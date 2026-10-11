import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { adminAuth } from "@/src/library/firebaseAdmin";
import { getIdToken } from "@/src/library/firestoreRest";
import { deleteAccountData, AccountDeletionError } from "@/src/library/accountDeletion";
import { ACCOUNT_DELETION_CONFIRMATION } from "@/src/library/accountDeletionConsent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RECENT_SIGN_IN_MAX_AGE_SECONDS = 10 * 60;
const DeleteAccountSchema = z.object({
  confirmation: z.literal(ACCOUNT_DELETION_CONFIRMATION),
  acknowledged: z.literal(true),
});

/** Permanent account removal. Identity is always derived from the verified
 * Firebase ID token, never from a caller-supplied user ID. */
export async function POST(request: NextRequest) {
  const idToken = getIdToken(request);
  if (!idToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = DeleteAccountSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: `Confirm deletion by entering ${ACCOUNT_DELETION_CONFIRMATION} and acknowledging the permanent removal.`,
    }, { status: 400 });
  }

  try {
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const now = Math.floor(Date.now() / 1000);
    if (typeof decoded.auth_time !== "number" || now - decoded.auth_time > RECENT_SIGN_IN_MAX_AGE_SECONDS) {
      return NextResponse.json({ error: "Recent sign-in is required before deleting your account." }, { status: 401 });
    }

    await deleteAccountData(decoded.uid);
    return NextResponse.json({ deleted: true }, {
      headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" },
    });
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code.startsWith("auth/")) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (error instanceof AccountDeletionError) {
      console.error("[account/delete] incomplete", {
        category: error.category,
        phase: error.phase,
        code: error.errorCode,
      });
      return NextResponse.json({ error: error.publicMessage }, { status: 503 });
    }
    console.error("[account/delete] failed", { category: error instanceof Error ? error.name : "unknown" });
    return NextResponse.json({ error: "Unable to delete your account right now. Please try again later." }, { status: 500 });
  }
}
