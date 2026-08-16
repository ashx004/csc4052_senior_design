import { describe, expect, it } from "vitest";
import { getRequestAuthToken } from "./requestAuthToken";

describe("getRequestAuthToken", () => {
  it("prefers the session cookie when both cookie and bearer are present", () => {
    expect(
      getRequestAuthToken({
        cookie: "cookie-token",
        authorization: "Bearer header-token",
      })
    ).toBe("cookie-token");
  });

  it("reads a Bearer token from the Authorization header", () => {
    expect(
      getRequestAuthToken({
        cookie: undefined,
        authorization: "Bearer header-token",
      })
    ).toBe("header-token");
  });

  it("accepts a case-insensitive Bearer prefix and trims the token", () => {
    expect(
      getRequestAuthToken({
        cookie: undefined,
        authorization: "bearer   header-token  ",
      })
    ).toBe("header-token");
  });

  it("returns null when no cookie or bearer token is present", () => {
    expect(
      getRequestAuthToken({
        cookie: undefined,
        authorization: null,
      })
    ).toBeNull();
    expect(
      getRequestAuthToken({
        cookie: "",
        authorization: "Basic abc",
      })
    ).toBeNull();
  });
});
