import "server-only";
import type { NextRequest } from "next/server";
import { adminAuth } from "@/src/library/firebaseAdmin";
import { SESSION_COOKIE, getRequestAuthToken } from "@/src/library/requestAuthToken";

// Stricter than verifyRequestAuth, for routes that move money (checkout,
// refunds, balance changes). verifyRequestAuth checks the token's signature
// only, so a stolen token keeps working for up to an hour after a password
// change or sign-out-everywhere. checkRevoked asks Firebase whether the
// session was revoked or the account disabled. It costs one network round
// trip, which is fine for these rare requests but not for every chat token.
export async function verifyBillingAuth(request: NextRequest): Promise<{ uid: string; email?: string } | null> {
  const token = getRequestAuthToken({
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    authorization: request.headers.get("authorization"),
  });
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token, true);
    return { uid: decoded.uid, email: decoded.email };
  } catch {
    return null;
  }
}
