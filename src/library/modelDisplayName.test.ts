import { describe, expect, it } from "vitest";
import { modelDisplayName } from "./modelDisplayName";

describe("modelDisplayName", () => {
  it("gives known tags a readable name", () => {
    expect(modelDisplayName("qwen3:30b-a3b")).toBe("Qwen3 30B-A3B");
    expect(modelDisplayName(" qwen3-vl:4b-instruct ")).toBe("Qwen3-VL 4B Instruct");
  });

  it("shows an unknown tag as-is instead of guessing", () => {
    expect(modelDisplayName("some-new-model:7b")).toBe("some-new-model:7b");
  });

  it("returns null when the model isn't configured", () => {
    expect(modelDisplayName(undefined)).toBeNull();
    expect(modelDisplayName("")).toBeNull();
  });
});
