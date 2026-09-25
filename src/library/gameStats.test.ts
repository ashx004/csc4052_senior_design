import { describe, expect, it, vi } from "vitest";

// firebase.tsx calls getAuth() at import time, which throws without a real
// NEXT_PUBLIC_FIREBASE_API_KEY — mocked so this module can be imported.
// Matches the pattern in src/library/chatMemory.test.ts.
vi.mock("./firebase", () => ({ db: {} }));

const { parseHighScore, shouldUpdateHighScore } = await import("./gameStats");

describe("parseHighScore", () => {
  it("returns 0 when the doc data is null or not an object", () => {
    expect(parseHighScore(null)).toBe(0);
    expect(parseHighScore(undefined)).toBe(0);
    expect(parseHighScore("not an object")).toBe(0);
  });

  it("returns 0 when blocksHighScore is missing or the wrong type", () => {
    expect(parseHighScore({})).toBe(0);
    expect(parseHighScore({ blocksHighScore: "12" })).toBe(0);
    expect(parseHighScore({ blocksHighScore: null })).toBe(0);
  });

  it("returns 0 for a negative stored value (defensive)", () => {
    expect(parseHighScore({ blocksHighScore: -5 })).toBe(0);
  });

  it("returns the number when it's a valid non-negative finite number", () => {
    expect(parseHighScore({ blocksHighScore: 42 })).toBe(42);
    expect(parseHighScore({ blocksHighScore: 0 })).toBe(0);
  });
});

describe("shouldUpdateHighScore", () => {
  it("is true when the new score beats the current one", () => {
    expect(shouldUpdateHighScore(10, 11)).toBe(true);
  });

  it("is false when the new score ties or is below the current one", () => {
    expect(shouldUpdateHighScore(10, 10)).toBe(false);
    expect(shouldUpdateHighScore(10, 9)).toBe(false);
  });
});
