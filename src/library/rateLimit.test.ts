import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit within the window", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit(key, 60_000, 3).allowed).toBe(true);
    }
  });

  it("blocks the request once the limit is reached", () => {
    const key = `test-${Math.random()}`;
    checkRateLimit(key, 60_000, 2);
    checkRateLimit(key, 60_000, 2);
    const result = checkRateLimit(key, 60_000, 2);
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("keys are independent of each other", () => {
    const keyA = `test-a-${Math.random()}`;
    const keyB = `test-b-${Math.random()}`;
    checkRateLimit(keyA, 60_000, 1);
    expect(checkRateLimit(keyA, 60_000, 1).allowed).toBe(false);
    expect(checkRateLimit(keyB, 60_000, 1).allowed).toBe(true);
  });

  it("allows a request again once the window has fully elapsed", () => {
    vi.useFakeTimers();
    const key = `test-${Math.random()}`;
    vi.setSystemTime(0);
    expect(checkRateLimit(key, 1_000, 1).allowed).toBe(true);
    expect(checkRateLimit(key, 1_000, 1).allowed).toBe(false);

    vi.setSystemTime(1_001);
    expect(checkRateLimit(key, 1_000, 1).allowed).toBe(true);
    vi.useRealTimers();
  });
});
