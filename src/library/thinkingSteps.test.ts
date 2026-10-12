import { describe, expect, it } from "vitest";
import { formatElapsed, recordStep } from "./thinkingSteps";

describe("recordStep", () => {
  it("adds new labels and ignores repeats and nulls", () => {
    let steps = recordStep([], "Connecting", 0);
    steps = recordStep(steps, "Connecting", 400);
    steps = recordStep(steps, null, 500);
    steps = recordStep(steps, "Searching your files", 1200);
    expect(steps).toEqual([
      { label: "Connecting", at: 0 },
      { label: "Searching your files", at: 1200 },
    ]);
  });
});

describe("formatElapsed", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsed(-5)).toBe("0s");
    expect(formatElapsed(9400)).toBe("9s");
    expect(formatElapsed(75000)).toBe("1m 15s");
  });
});
