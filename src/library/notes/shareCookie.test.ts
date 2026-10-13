import { describe, expect, it } from "vitest";
import { hasValidShareCookie, shareAccessCookieValue } from "./shareCookie";

describe("share access cookie", () => {
  it("accepts the cookie this server issued for that share", () => {
    expect(hasValidShareCookie(shareAccessCookieValue("abc"), "abc")).toBe(true);
  });

  it("rejects the bare share id that used to be enough", () => {
    expect(hasValidShareCookie("abc", "abc")).toBe(false);
  });

  it("rejects a cookie issued for a different share, a tampered one, and a missing one", () => {
    expect(hasValidShareCookie(shareAccessCookieValue("abc"), "xyz")).toBe(false);
    expect(hasValidShareCookie(`${shareAccessCookieValue("abc")}x`, "abc")).toBe(false);
    expect(hasValidShareCookie(undefined, "abc")).toBe(false);
    expect(hasValidShareCookie("", "")).toBe(false);
  });
});
