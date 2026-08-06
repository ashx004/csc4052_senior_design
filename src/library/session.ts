"use client";

// Rolling 30-day "remember this device" window, layered on top of
// Firebase's own session persistence (which is indefinite by default — its
// refresh token never expires on its own). Without this, "remember me"
// would really mean "remembered forever." This cookie's own max-age is what
// actually enforces the 30-day cutoff: it's set fresh on every interactive
// sign-in and slid forward on every subsequent visit within the window (see
// AuthContext.tsx), and the browser itself drops it once 30 days pass with
// no visit — AuthContext then treats that as an expired session rather than
// silently restoring it forever.
export const REMEMBER_COOKIE = "fb_remember";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export function hasRememberCookie(): boolean {
  return document.cookie.split("; ").some((c) => c.startsWith(`${REMEMBER_COOKIE}=`));
}

// Same write whether this is starting a fresh window (interactive sign-in)
// or sliding an existing one forward (AuthContext, on every token refresh
// while the window is still active) — callers just differ in when/why.
export function touchRememberCookie(): void {
  document.cookie = `${REMEMBER_COOKIE}=1; path=/; max-age=${THIRTY_DAYS_SECONDS}; SameSite=Lax`;
}

export function clearRememberCookie(): void {
  document.cookie = `${REMEMBER_COOKIE}=; path=/; max-age=0`;
}
