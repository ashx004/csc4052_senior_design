import { describe, it, expect } from "vitest";
import { getChickenStateFromProgress } from "../chickenConfig";

describe("getChickenStateFromProgress", () => {
  it("returns egg at 0 progress", () => {
    expect(getChickenStateFromProgress(0, "active")).toBe("egg");
  });

  it("returns egg at 10% progress", () => {
    expect(getChickenStateFromProgress(0.1, "active")).toBe("egg");
  });

  it("returns hatching at 25% progress", () => {
    expect(getChickenStateFromProgress(0.25, "active")).toBe("hatching");
  });

  it("returns growing at 50% progress", () => {
    expect(getChickenStateFromProgress(0.5, "active")).toBe("growing");
  });

  it("returns almost at 90% progress", () => {
    expect(getChickenStateFromProgress(0.9, "active")).toBe("almost");
  });

  it("returns complete at 100% progress", () => {
    expect(getChickenStateFromProgress(1.0, "active")).toBe("complete");
  });

  it("returns dead when abandoned", () => {
    expect(getChickenStateFromProgress(0.5, "abandoned")).toBe("dead");
  });

  it("returns paused when paused", () => {
    expect(getChickenStateFromProgress(0.5, "paused")).toBe("paused");
  });

  it("returns complete when completed regardless of progress", () => {
    expect(getChickenStateFromProgress(0.3, "completed")).toBe("complete");
  });
});
