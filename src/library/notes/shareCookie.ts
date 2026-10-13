import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// The cookie that lets a visitor read a share's files and edit it after they have
// passed its password / sign-in / invite check. It used to hold just the share id,
// which is also in the link, so anyone with the link could write that cookie by
// hand and skip the check. Signing it means only this server can issue one.

// Falls back to a per-process key if no server secret is configured: cookies then
// stop working after a restart, which fails safe.
const FALLBACK_KEY = randomBytes(32).toString("hex");
const key = () => process.env.INTERNAL_API_SECRET || process.env.FIREBASE_ADMIN_PRIVATE_KEY || FALLBACK_KEY;
const sign = (shareId: string) => createHmac("sha256", key()).update(`note-share:${shareId}`).digest("base64url");

export const SHARE_COOKIE = "note_share_access";

export function shareAccessCookieValue(shareId: string): string {
  return `${shareId}.${sign(shareId)}`;
}

/** True when the cookie was issued by this server for exactly this share. */
export function hasValidShareCookie(cookieValue: string | undefined, shareId: string): boolean {
  if (!cookieValue || !shareId) return false;
  const expected = Buffer.from(shareAccessCookieValue(shareId));
  const given = Buffer.from(cookieValue);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
