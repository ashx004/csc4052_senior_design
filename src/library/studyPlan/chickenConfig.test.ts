import { describe, it, expect } from "vitest";
import {
  getChickenStateFromProgress,
  PROGRESS_THRESHOLDS,
} from "./chickenConfig";

describe("getChickenStateFromProgress — equal quarters", () => {
  it("uses quarter thresholds", () => {
    expect(PROGRESS_THRESHOLDS).toEqual({
      hatching: 0.25,
      growing: 0.5,
      almost: 0.75,
      complete: 1.0,
    });
  });

  it("stays egg for the first quarter (no 1-second jump)", () => {
    expect(getChickenStateFromProgress(0, "active")).toBe("egg");
    expect(getChickenStateFromProgress(0.01, "active")).toBe("egg");
    expect(getChickenStateFromProgress(0.24, "active")).toBe("egg");
  });

  it("walks the quarters", () => {
    expect(getChickenStateFromProgress(0.25, "active")).toBe("hatching");
    expect(getChickenStateFromProgress(0.49, "active")).toBe("hatching");
    expect(getChickenStateFromProgress(0.5, "active")).toBe("growing");
    expect(getChickenStateFromProgress(0.74, "active")).toBe("growing");
    expect(getChickenStateFromProgress(0.75, "active")).toBe("almost");
    expect(getChickenStateFromProgress(0.99, "active")).toBe("almost");
    expect(getChickenStateFromProgress(1.0, "active")).toBe("complete");
  });

  it("status overrides progress", () => {
    expect(getChickenStateFromProgress(0.5, "paused")).toBe("paused");
    expect(getChickenStateFromProgress(0.5, "abandoned")).toBe("dead");
    expect(getChickenStateFromProgress(0.1, "completed")).toBe("complete");
  });
});
