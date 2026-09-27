import { afterEach, describe, expect, it, vi } from "vitest";
import {
  codesMatch,
  createEmailOtpCode,
  getEmailOtpConfig,
  hashEmailOtpCode,
  isEmailOtpCode,
} from "./authEmailOtp";

describe("email login OTP helpers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("generates an eight-digit numeric code", () => {
    expect(createEmailOtpCode()).toMatch(/^\d{8}$/);
  });

  it("matches only the correct code for the same challenge", () => {
    const secret = "a-very-long-test-secret-that-is-at-least-32-characters";
    const hash = hashEmailOtpCode("challenge-a", "01234567", secret);

    expect(codesMatch(hash, "challenge-a", "01234567", secret)).toBe(true);
    expect(codesMatch(hash, "challenge-a", "01234568", secret)).toBe(false);
    expect(codesMatch(hash, "challenge-b", "01234567", secret)).toBe(false);
    expect(isEmailOtpCode("01234567")).toBe(true);
    expect(isEmailOtpCode("1234567")).toBe(false);
  });

  it("requires a sufficiently long server secret", () => {
    vi.stubEnv("AUTH_EMAIL_OTP_SECRET", "too-short");
    expect(() => getEmailOtpConfig()).toThrow("AUTH_EMAIL_OTP_SECRET");

    vi.stubEnv("AUTH_EMAIL_OTP_SECRET", "a-very-long-test-secret-that-is-at-least-32-characters");
    expect(getEmailOtpConfig().maxAttempts).toBe(5);
  });
});
