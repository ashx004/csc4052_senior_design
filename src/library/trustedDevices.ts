import { createHmac, timingSafeEqual } from "node:crypto";

// "Remember this device": after one correct emailed code, a browser is trusted and
// skips the code on later password sign-ins. The browser holds a signed cookie and
// the server keeps a record per device (users/{uid}/trustedDevices/{deviceId}), so
// a device can be removed from Settings and stops being trusted straight away.
// Pure helpers so they are unit-tested; the routes do the I/O.

export const TRUSTED_DEVICE_COOKIE = "auth_trusted_device";
/** Each trusted sign-in renews the cookie, so a device in regular use stays trusted. */
export const TRUSTED_DEVICE_MAX_AGE_SECONDS = 60 * 24 * 60 * 60;
export const MAX_TRUSTED_DEVICES = 20;

const sign = (uid: string, deviceId: string, secret: string) =>
  createHmac("sha256", secret).update(`trusted-device:${uid}:${deviceId}`).digest("base64url");

export function trustedDeviceCookieValue(uid: string, deviceId: string, secret: string): string {
  return `${deviceId}.${sign(uid, deviceId, secret)}`;
}

/** The device id inside a cookie this server issued for this user, or null. */
export function readTrustedDeviceCookie(value: string | undefined, uid: string, secret: string): string | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const deviceId = value.slice(0, dot);
  const expected = Buffer.from(trustedDeviceCookieValue(uid, deviceId, secret));
  const given = Buffer.from(value);
  return given.length === expected.length && timingSafeEqual(given, expected) ? deviceId : null;
}

/** "Chrome on Windows", from a User-Agent header. Order matters: Edge and Chrome both say Chrome, and iPads say Mac. */
export function describeDevice(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg(?:e|A|iOS)?\//.test(ua) ? "Edge"
    : /OPR\/|Opera/.test(ua) ? "Opera"
    : /Firefox\/|FxiOS\//.test(ua) ? "Firefox"
    : /Chrome\/|CriOS\//.test(ua) ? "Chrome"
    : /Safari\//.test(ua) ? "Safari"
    : "Browser";
  const system = /iPhone|iPad|iPod/.test(ua) ? "iOS"
    : /Android/.test(ua) ? "Android"
    : /Windows/.test(ua) ? "Windows"
    : /Mac OS X|Macintosh/.test(ua) ? "macOS"
    : /CrOS/.test(ua) ? "ChromeOS"
    : /Linux/.test(ua) ? "Linux"
    : "";
  return system ? `${browser} on ${system}` : browser;
}

/** Ids to delete so no more than `max` devices remain, dropping the least recently used first. */
export function devicesToPrune(devices: { id: string; lastSeenAtMs: number }[], max: number = MAX_TRUSTED_DEVICES): string[] {
  if (devices.length <= max) return [];
  return [...devices].sort((a, b) => a.lastSeenAtMs - b.lastSeenAtMs).slice(0, devices.length - max).map((d) => d.id);
}
