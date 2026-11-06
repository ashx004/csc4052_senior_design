import { describe, expect, it } from "vitest";
import { preparingLabel } from "./taskActivityLabel";

describe("preparingLabel", () => {
  it("names flashcards while a flashcard set is being built", () => {
    expect(preparingLabel("flashcards")).toBe("Preparing flashcards...");
  });

  it("names a quiz while a quiz is being built", () => {
    expect(preparingLabel("quiz")).toBe("Preparing quiz...");
  });

  it("stays generic for activities that build nothing", () => {
    expect(preparingLabel("reading")).toBe("Preparing...");
    expect(preparingLabel("ai_explanation")).toBe("Preparing...");
  });
});
