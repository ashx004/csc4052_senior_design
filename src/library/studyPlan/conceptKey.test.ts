import { describe, expect, it } from "vitest";
import { conceptKey, isUsableConceptLabel } from "./conceptKey";

describe("conceptKey", () => {
  it("collapses case, leading 'the', and inner whitespace to one key", () => {
    expect(conceptKey("Chain Rule")).toBe("chain rule");
    expect(conceptKey("the chain rule")).toBe("chain rule");
    expect(conceptKey("  The   Chain  Rule  ")).toBe("chain rule");
  });

  it("keeps 'the' when it is not leading", () => {
    expect(conceptKey("Order of the operations")).toBe("order of the operations");
  });

  it("returns an empty key for a label with no usable text", () => {
    expect(conceptKey("   ")).toBe("");
  });
});

describe("isUsableConceptLabel", () => {
  it("rejects placeholder labels the model sometimes returns", () => {
    expect(isUsableConceptLabel("Question 4")).toBe(false);
    expect(isUsableConceptLabel("Topic 1")).toBe(false);
    expect(isUsableConceptLabel("Chapter content")).toBe(false);
    expect(isUsableConceptLabel("")).toBe(false);
  });

  it("accepts a real idea", () => {
    expect(isUsableConceptLabel("Chain Rule")).toBe(true);
  });
});
