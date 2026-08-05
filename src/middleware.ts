import { NextRequest, NextResponse } from "next/server";
import { jwtVerify, createRemoteJWKSet } from "jose";

// Verifies the Firebase ID token cookie directly against Google's public
// keys at the edge — no Firebase Admin SDK / service account needed. This is
// the standard pattern for Firebase Auth + Next.js Edge Middleware.
const PROJECT_ID = "studora-933f8";
const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);
const SESSION_COOKIE = "fb_token";
// Separate from SESSION_COOKIE (which just proves the ID token itself is
// still fresh, on an hourly cycle) — this one enforces the 30-day "remember
// this device" cap. It's set/slid-forward client-side in AuthContext.tsx
// and session.ts; checked here too so an expired window is rejected at the
// edge even on the very first request, before any client JS has run.
const REMEMBER_COOKIE = "fb_remember";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const remembered = request.cookies.get(REMEMBER_COOKIE)?.value;
  if (!token || !remembered) {
    return redirectToLogin(request);
  }

  try {
    await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    return NextResponse.next();
  } catch {
    return redirectToLogin(request);
  }
}

function redirectToLogin(request: NextRequest) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("redirect", request.nextUrl.pathname);
  const response = NextResponse.redirect(loginUrl);
  // Clear both a stale/expired token and an elapsed remember-window cookie
  // so we don't loop.
  response.cookies.delete(SESSION_COOKIE);
  response.cookies.delete(REMEMBER_COOKIE);
  return response;
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};

