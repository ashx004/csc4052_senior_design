import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createEmailOtpCode,
  createLoginChallengeId,
  getEmailOtpConfig,
  hashEmailOtpCode,
  LOGIN_2FA_CHALLENGE_COOKIE,
} from "@/src/library/authEmailOtp";
import { adminAuth, adminDb } from "@/src/library/firebaseAdmin";
import { sendEmail } from "@/src/library/email/resend";
import { emailVerificationTemplate, loginTwoFactorTemplate } from "@/src/library/email/templates";
import { generateVerificationLink } from "@/src/library/email/firebaseAuthActions";
import { checkRateLimit } from "@/src/library/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LoginSchema = z.object({
  email: z.string().trim().email().max(320),
  password: z.string().min(1).max(4_096),
});

function clientIp(request: NextRequest): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")
    || "unknown";
}

function tooManyRequests(retryAfterSeconds: number | undefined) {
  return NextResponse.json(
    { error: "Too many sign-in attempts. Please try again later." },
    { status: 429, headers: retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : undefined },
  );
}

async function validateFirebasePassword(email: string, password: string): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) throw new Error("NEXT_PUBLIC_FIREBASE_API_KEY is not configured.");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, returnSecureToken: true }),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;

  const data = await response.json().catch(() => null) as { localId?: unknown } | null;
  return typeof data?.localId === "string" ? data.localId : null;
}

export async function POST(request: NextRequest) {
  const parsed = LoginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address and password." }, { status: 400 });

  const email = parsed.data.email.toLowerCase();
  const ip = clientIp(request);
  const ipLimit = checkRateLimit(`login-2fa:start:ip:${ip}`, 10 * 60_000, 20);
  // Bind the tighter password-attempt limit to both account and client. A
  // global per-email limit would let anyone who knows an address deny that
  // user access for ten minutes without knowing their password.
  const emailLimit = checkRateLimit(`login-2fa:start:email:${email}:ip:${ip}`, 10 * 60_000, 5);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit.retryAfterSeconds);
  if (!emailLimit.allowed) return tooManyRequests(emailLimit.retryAfterSeconds);

  try {
    const uid = await validateFirebasePassword(email, parsed.data.password);
    if (!uid) return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });

    const user = await adminAuth.getUser(uid);
    if (!user.email) {
      return NextResponse.json({ error: "Verify your email address before signing in." }, { status: 403 });
    }
    if (user.disabled) return NextResponse.json({ error: "This account is disabled." }, { status: 403 });
    if (!user.emailVerified) {
      const actionUrl = await generateVerificationLink(user.email);
      const emailMessage = emailVerificationTemplate({
        actionUrl,
        recipientName: user.displayName,
      });
      await sendEmail({
        to: user.email,
        subject: emailMessage.subject,
        html: emailMessage.html,
        text: emailMessage.text,
      });
      return NextResponse.json(
        { error: "Verify your email address before signing in. We sent a new verification link to your email." },
        { status: 403 },
      );
    }
    const config = getEmailOtpConfig();

    const challengeId = createLoginChallengeId();
    const code = createEmailOtpCode();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + config.ttlSeconds * 1_000);
    const challengeRef = adminDb.collection("authLoginChallenges").doc(challengeId);
    const stateRef = adminDb.collection("authLoginChallengeState").doc(uid);

    await adminDb.runTransaction(async (transaction) => {
      const previousState = await transaction.get(stateRef);
      const previousChallengeId = previousState.exists ? previousState.get("challengeId") : null;
      if (typeof previousChallengeId === "string") {
        const previousChallengeRef = adminDb.collection("authLoginChallenges").doc(previousChallengeId);
        const previousChallenge = await transaction.get(previousChallengeRef);
        if (previousChallenge.exists) {
          transaction.update(previousChallengeRef, {
            status: "superseded",
            supersededAt: FieldValue.serverTimestamp(),
          });
        }
      }
      transaction.set(challengeRef, {
        uid,
        email: user.email,
        recipientName: user.displayName ?? null,
        codeHash: hashEmailOtpCode(challengeId, code, config.secret),
        status: "pending",
        attempts: 0,
        sendCount: 1,
        expiresAt: Timestamp.fromDate(expiresAt),
        resendAvailableAt: Timestamp.fromDate(new Date(now.getTime() + config.resendCooldownSeconds * 1_000)),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      transaction.set(stateRef, {
        challengeId,
        expiresAt: Timestamp.fromDate(expiresAt),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    const emailMessage = loginTwoFactorTemplate({
      code,
      recipientName: user.displayName,
      expiresInMinutes: Math.ceil(config.ttlSeconds / 60),
    });
    await sendEmail({
      to: user.email,
      subject: emailMessage.subject,
      html: emailMessage.html,
      text: emailMessage.text,
      idempotencyKey: `auth-login-2fa/${challengeId}/1`,
    });

    const response = NextResponse.json({
      message: "A sign-in code was sent to your email address.",
      expiresInSeconds: config.ttlSeconds,
      resendAfterSeconds: config.resendCooldownSeconds,
    });
    response.cookies.set(LOGIN_2FA_CHALLENGE_COOKIE, challengeId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/api/auth/login-2fa",
      maxAge: config.ttlSeconds,
    });
    return response;
  } catch (error) {
    console.error("[auth/login-2fa/start] Failed:", error);
    return NextResponse.json({ error: "Unable to start sign-in verification. Please try again." }, { status: 500 });
  }
}
