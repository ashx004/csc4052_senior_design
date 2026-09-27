import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  codesMatch,
  getEmailOtpConfig,
  isEmailOtpCode,
  LOGIN_2FA_CHALLENGE_COOKIE,
} from "@/src/library/authEmailOtp";
import { adminAuth, adminDb } from "@/src/library/firebaseAdmin";
import { checkRateLimit } from "@/src/library/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VerifySchema = z.object({ code: z.string().trim() });

type ChallengeData = {
  uid?: unknown;
  codeHash?: unknown;
  status?: unknown;
  attempts?: unknown;
  expiresAt?: unknown;
};

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function timestamp(value: unknown): Timestamp | null {
  return value instanceof Timestamp ? value : null;
}

function responseError(message: string, status: number, clearCookie = false) {
  const response = NextResponse.json({ error: message }, { status });
  if (clearCookie) {
    response.cookies.set(LOGIN_2FA_CHALLENGE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/login-2fa",
      maxAge: 0,
    });
  }
  return response;
}

export async function POST(request: NextRequest) {
  const challengeId = request.cookies.get(LOGIN_2FA_CHALLENGE_COOKIE)?.value;
  const parsed = VerifySchema.safeParse(await request.json().catch(() => null));
  if (!challengeId || !parsed.success || !isEmailOtpCode(parsed.data.code)) {
    return responseError("Enter the eight-digit sign-in code.", 400);
  }

  const ip = clientIp(request);
  const ipLimit = checkRateLimit(`login-2fa:verify:ip:${ip}`, 10 * 60_000, 30);
  const challengeLimit = checkRateLimit(`login-2fa:verify:challenge:${challengeId}`, 10 * 60_000, 8);
  if (!ipLimit.allowed || !challengeLimit.allowed) {
    return responseError("Too many code attempts. Please start over and try again later.", 429, true);
  }

  try {
    const config = getEmailOtpConfig();
    const challengeRef = adminDb.collection("authLoginChallenges").doc(challengeId);
    const result = await adminDb.runTransaction(async (transaction) => {
      const challenge = await transaction.get(challengeRef);
      if (!challenge.exists) return { reason: "expired" as const };

      const data = challenge.data() as ChallengeData;
      const uid = typeof data.uid === "string" ? data.uid : null;
      const codeHash = typeof data.codeHash === "string" ? data.codeHash : null;
      const expiresAt = timestamp(data.expiresAt);
      if (!uid || !codeHash || data.status !== "pending" || !expiresAt || expiresAt.toDate() <= new Date()) {
        transaction.update(challengeRef, {
          status: "expired",
          expiredAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        return { reason: "expired" as const };
      }

      const stateRef = adminDb.collection("authLoginChallengeState").doc(uid);
      const state = await transaction.get(stateRef);
      if (!state.exists || state.get("challengeId") !== challengeId) {
        return { reason: "expired" as const };
      }

      const attempts = typeof data.attempts === "number" ? data.attempts : 0;
      if (!codesMatch(codeHash, challengeId, parsed.data.code, config.secret)) {
        const nextAttempts = attempts + 1;
        const locked = nextAttempts >= config.maxAttempts;
        transaction.update(challengeRef, {
          attempts: nextAttempts,
          status: locked ? "locked" : "pending",
          ...(locked ? { lockedAt: FieldValue.serverTimestamp() } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        });
        if (locked) transaction.delete(stateRef);
        return { reason: locked ? "locked" as const : "invalid" as const };
      }

      transaction.update(challengeRef, {
        status: "consumed",
        consumedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.delete(stateRef);
      return { uid };
    });

    if ("reason" in result) {
      const message = result.reason === "invalid"
        ? "That code is not correct."
        : result.reason === "locked"
          ? "Too many incorrect codes. Start sign-in again."
          : "That sign-in code has expired. Start again.";
      return responseError(message, 401, result.reason !== "invalid");
    }

    const user = await adminAuth.getUser(result.uid);
    if (user.disabled || !user.emailVerified) {
      return responseError("This account cannot complete sign-in.", 403, true);
    }
    const customToken = await adminAuth.createCustomToken(result.uid, { second_factor: "email_otp" });
    const response = NextResponse.json({ customToken });
    response.cookies.set(LOGIN_2FA_CHALLENGE_COOKIE, "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/login-2fa",
      maxAge: 0,
    });
    return response;
  } catch (error) {
    console.error("[auth/login-2fa/verify] Failed:", error);
    return responseError("Unable to verify the sign-in code. Please try again.", 500);
  }
}
