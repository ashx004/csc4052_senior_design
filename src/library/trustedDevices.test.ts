import { describe, expect, it } from "vitest";
import { describeDevice, devicesToPrune, readTrustedDeviceCookie, trustedDeviceCookieValue } from "./trustedDevices";

const SECRET = "x".repeat(40);

describe("trusted device cookie", () => {
  it("is read back for the user it was issued to", () => {
    const cookie = trustedDeviceCookieValue("u1", "dev-1", SECRET);
    expect(readTrustedDeviceCookie(cookie, "u1", SECRET)).toBe("dev-1");
  });

  it("is refused for another user, another secret, or when tampered with", () => {
    const cookie = trustedDeviceCookieValue("u1", "dev-1", SECRET);
    expect(readTrustedDeviceCookie(cookie, "u2", SECRET)).toBeNull();
    expect(readTrustedDeviceCookie(cookie, "u1", "y".repeat(40))).toBeNull();
    expect(readTrustedDeviceCookie(cookie.replace("dev-1", "dev-2"), "u1", SECRET)).toBeNull();
    expect(readTrustedDeviceCookie(`${cookie}x`, "u1", SECRET)).toBeNull();
  });

  it("is refused when missing or malformed", () => {
    expect(readTrustedDeviceCookie(undefined, "u1", SECRET)).toBeNull();
    expect(readTrustedDeviceCookie("", "u1", SECRET)).toBeNull();
    expect(readTrustedDeviceCookie("nodot", "u1", SECRET)).toBeNull();
    expect(readTrustedDeviceCookie(".sig", "u1", SECRET)).toBeNull();
  });
});

describe("describeDevice", () => {
  it("names common browsers and systems", () => {
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36")).toBe("Chrome on Windows");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0")).toBe("Edge on Windows");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15")).toBe("Safari on macOS");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari on iOS");
    expect(describeDevice("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0")).toBe("Firefox on Linux");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe("Chrome on Android");
  });

  it("falls back to a generic name", () => {
    expect(describeDevice(undefined)).toBe("Browser");
    expect(describeDevice("curl/8.0")).toBe("Browser");
  });
});

describe("devicesToPrune", () => {
  it("keeps everything when under the limit", () => {
    expect(devicesToPrune([{ id: "a", lastSeenAtMs: 1 }], 2)).toEqual([]);
  });

  it("drops the least recently used first", () => {
    const devices = [{ id: "a", lastSeenAtMs: 30 }, { id: "b", lastSeenAtMs: 10 }, { id: "c", lastSeenAtMs: 20 }];
    expect(devicesToPrune(devices, 2)).toEqual(["b"]);
    expect(devicesToPrune(devices, 1)).toEqual(["b", "c"]);
  });
});

import { isDeviceId, signInMethod } from "./trustedDevices";

describe("sign-in device helpers", () => {
  it("names the sign-in method from the token's provider", () => {
    expect(signInMethod("google.com")).toBe("Google");
    expect(signInMethod("apple.com")).toBe("Apple");
    expect(signInMethod("custom")).toBe("Password");
    expect(signInMethod(undefined)).toBe("Unknown");
  });
  it("only accepts device ids it could have issued", () => {
    expect(isDeviceId("0b1e9c4a-3c1f-4f8e-9a51-6f0e2d7c1b2a")).toBe(true);
    expect(isDeviceId("../other-user")).toBe(false);
    expect(isDeviceId("")).toBe(false);
  });
});
