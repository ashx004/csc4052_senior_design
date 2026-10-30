import { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet, decodeJwt } from "jose";
import { SESSION_COOKIE, getRequestAuthToken } from "./requestAuthToken";

// API routes are NOT covered by middleware.ts's edge auth check (its matcher
// deliberately excludes /api — a redirect-to-login response makes no sense
// for a fetch() call expecting JSON). This is the API-route equivalent:
// same verification approach (Firebase ID token cookie or Authorization
// Bearer header checked against Google's public keys, no Admin SDK/service
// account needed), but returns a clean pass/fail instead of a redirect, and
// the caller returns a 401 JSON response on failure.
const PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "studora-933f8";
const isLocalE2e = process.env.E2E_LOCAL === "true";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyRequestAuth(request: NextRequest): Promise<{ uid: string } | null> {
  const token = getRequestAuthToken({
    cookie: request.cookies.get(SESSION_COOKIE)?.value,
    authorization: request.headers.get("authorization"),
  });
  if (!token) return null;

  if (isLocalE2e) {
    try {
      const payload = decodeJwt(token);
      return typeof payload.sub === "string" ? { uid: payload.sub } : null;
    } catch {
      return null;
    }
  }

  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (typeof payload.sub !== "string") return null;
    return { uid: payload.sub };
  } catch {
    return null;
  }
}

// A handful of routes (read_document's document fetch, generate-flashcards'
// document fetch) call /api/download server-to-server with no browser
// session to check. This lets those specific internal calls bypass the
// user-auth check without opening the route up to the public — only code
// that already has this server's own env var can produce a valid header.
export function isInternalRequest(request: NextRequest): boolean {
  const secret = process.env.INTERNAL_API_SECRET;
  if (!secret) return false;
  return request.headers.get("x-internal-secret") === secret;
}
