import { describe, expect, it } from "vitest";
import { composeDictation, speechErrorMessage } from "./useSpeechToText";

describe("composeDictation", () => {
  it("appends speech after what was already typed", () => {
    expect(composeDictation("Explain", " recursion  with an example ")).toBe("Explain recursion with an example");
  });

  it("works with an empty box or no speech yet", () => {
    expect(composeDictation("", "hello")).toBe("hello");
    expect(composeDictation("  typed ", "")).toBe("typed");
  });

  it("respects the input's max length", () => {
    expect(composeDictation("abc", "defgh", 6)).toBe("abc de");
  });
});

describe("speechErrorMessage", () => {
  it("explains a blocked microphone", () => {
    expect(speechErrorMessage("not-allowed")).toMatch(/blocked/);
  });

  it("stays quiet when we stopped it ourselves", () => {
    expect(speechErrorMessage("aborted")).toBeNull();
  });

  it("has a fallback for unknown errors", () => {
    expect(speechErrorMessage("something-new")).toMatch(/Try again/);
  });
});
