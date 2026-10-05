import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import {
  createEmailOtpCode,
  getEmailOtpConfig,
  hashEmailOtpCode,
  LOGIN_2FA_CHALLENGE_COOKIE,
} from "@/src/library/authEmailOtp";
import { adminDb } from "@/src/library/firebaseAdmin";
import { sendEmail } from "@/src/library/email/resend";
import { loginTwoFactorTemplate } from "@/src/library/email/templates";
import { checkRateLimit } from "@/src/library/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ChallengeData = {
  uid?: unknown;
  email?: unknown;
  recipientName?: unknown;
  codeHash?: unknown;
  status?: unknown;
  sendCount?: unknown;
  expiresAt?: unknown;
  resendAvailableAt?: unknown;
};

function timestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function clearChallengeCookie(response: NextResponse) {
  response.cookies.set(LOGIN_2FA_CHALLENGE_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/login-2fa",
    maxAge: 0,
  });
  return response;
}

export async function POST(request: NextRequest) {
  const challengeId = request.cookies.get(LOGIN_2FA_CHALLENGE_COOKIE)?.value;
  if (!challengeId) return NextResponse.json({ error: "Start sign-in again to request a new code." }, { status: 400 });

  const requestLimit = checkRateLimit(`login-2fa:resend:${challengeId}`, 10 * 60_000, 4);
  if (!requestLimit.allowed) {
    return NextResponse.json({ error: "Too many resend attempts. Start sign-in again later." }, { status: 429 });
  }

  try {
    const config = getEmailOtpConfig();
    const now = new Date();
    const code = createEmailOtpCode();
    const challengeRef = adminDb.collection("authLoginChallenges").doc(challengeId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const challenge = await transaction.get(challengeRef);
      if (!challenge.exists) return { reason: "expired" as const };

      const data = challenge.data() as ChallengeData;
      const uid = typeof data.uid === "string" ? data.uid : null;
      const email = typeof data.email === "string" ? data.email : null;
      const expiresAt = timestamp(data.expiresAt);
      const resendAvailableAt = timestamp(data.resendAvailableAt);
      const sends = typeof data.sendCount === "number" ? data.sendCount : 0;
      if (!uid || !email || data.status !== "pending" || !expiresAt || expiresAt.toDate() <= now) {
        transaction.update(challengeRef, { status: "expired", updatedAt: FieldValue.serverTimestamp() });
        return { reason: "expired" as const };
      }
      const stateRef = adminDb.collection("authLoginChallengeState").doc(uid);
      const state = await transaction.get(stateRef);
      if (!state.exists || state.get("challengeId") !== challengeId) {
        return { reason: "expired" as const };
      }
      if (resendAvailableAt && resendAvailableAt.toDate() > now) {
        return { reason: "cooldown" as const, retryAfterSeconds: Math.ceil((resendAvailableAt.toDate().getTime() - now.getTime()) / 1_000) };
      }
      if (sends >= config.maxSends) {
        transaction.update(challengeRef, { status: "locked", lockedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
        transaction.delete(stateRef);
        return { reason: "limit" as const };
      }

      const sendCount = sends + 1;
      transaction.update(challengeRef, {
        codeHash: hashEmailOtpCode(challengeId, code, config.secret),
        sendCount,
        resendAvailableAt: Timestamp.fromDate(new Date(now.getTime() + config.resendCooldownSeconds * 1_000)),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return {
        email,
        recipientName: typeof data.recipientName === "string" ? data.recipientName : null,
        sendCount,
      };
    });

    if ("reason" in result) {
      if (result.reason === "cooldown") {
        return NextResponse.json({ error: "Please wait before requesting another code.", resendAfterSeconds: result.retryAfterSeconds }, { status: 429 });
      }
      const response = NextResponse.json({ error: "This sign-in challenge has expired. Start again." }, { status: 400 });
      return clearChallengeCookie(response);
    }

    const emailMessage = loginTwoFactorTemplate({
      code,
      recipientName: result.recipientName,
      expiresInMinutes: Math.ceil(config.ttlSeconds / 60),
    });
    await sendEmail({
      to: result.email,
      subject: emailMessage.subject,
      html: emailMessage.html,
      text: emailMessage.text,
      idempotencyKey: `auth-login-2fa/${challengeId}/${result.sendCount}`,
    });
    return NextResponse.json({ message: "A new sign-in code was sent.", resendAfterSeconds: config.resendCooldownSeconds });
  } catch (error) {
    console.error("[auth/login-2fa/resend] Failed:", error);
    return NextResponse.json({ error: "Unable to send another code. Please try again." }, { status: 500 });
  }
}
