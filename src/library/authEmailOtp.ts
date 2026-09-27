import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";

export const LOGIN_2FA_CHALLENGE_COOKIE = "auth_login_2fa";

export type EmailOtpConfig = {
  secret: string;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  maxSends: number;
};

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getEmailOtpConfig(): EmailOtpConfig {
  const secret = process.env.AUTH_EMAIL_OTP_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_EMAIL_OTP_SECRET must be set to a random value of at least 32 characters.");
  }

  return {
    secret,
    ttlSeconds: positiveInteger(process.env.AUTH_EMAIL_OTP_TTL_SECONDS, 10 * 60),
    maxAttempts: positiveInteger(process.env.AUTH_EMAIL_OTP_MAX_ATTEMPTS, 5),
    resendCooldownSeconds: positiveInteger(process.env.AUTH_EMAIL_OTP_RESEND_COOLDOWN_SECONDS, 60),
    maxSends: positiveInteger(process.env.AUTH_EMAIL_OTP_MAX_SENDS, 3),
  };
}

export function createLoginChallengeId(): string {
  return randomUUID();
}

export function createEmailOtpCode(): string {
  return randomInt(0, 100_000_000).toString().padStart(8, "0");
}

export function hashEmailOtpCode(challengeId: string, code: string, secret: string): string {
  return createHmac("sha256", secret).update(`${challengeId}:${code}`).digest("base64url");
}

export function codesMatch(expectedHash: string, challengeId: string, code: string, secret: string): boolean {
  const actualHash = hashEmailOtpCode(challengeId, code, secret);
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(actualHash);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function isEmailOtpCode(value: string): boolean {
  return /^\d{8}$/.test(value);
}
