import { NextRequest } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

// API routes are NOT covered by middleware.ts's edge auth check (its matcher
// deliberately excludes /api — a redirect-to-login response makes no sense
// for a fetch() call expecting JSON). This is the API-route equivalent:
// same verification approach (Firebase ID token cookie checked against
// Google's public keys, no Admin SDK/service account needed), but returns a
// clean pass/fail instead of a redirect, and the caller returns a 401 JSON
// response on failure.
const PROJECT_ID = "studora-933f8";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);
const SESSION_COOKIE = "fb_token";

export async function verifyRequestAuth(request: NextRequest): Promise<{ uid: string } | null> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;

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
