import { describe, expect, it } from "vitest";
import { retirementOutcome, scoreSessionByConcept } from "./conceptRetirement";

describe("scoreSessionByConcept", () => {
  it("scores each concept on its own within one mixed session", () => {
    const scores = scoreSessionByConcept([
      { conceptKey: "chain rule", score: 1 },
      { conceptKey: "chain rule", score: 1 },
      { conceptKey: "chain rule", score: 0 },
      { conceptKey: "product rule", score: 1 },
      { conceptKey: "product rule", score: 1 },
    ]);
    expect(scores.find((s) => s.conceptKey === "chain rule")!.percent).toBeCloseTo(66.67, 1);
    expect(scores.find((s) => s.conceptKey === "product rule")!.percent).toBe(100);
  });

  it("sums fractional scores rather than counting whole items", () => {
    const scores = scoreSessionByConcept([
      { conceptKey: "chain rule", score: 0.67 },
      { conceptKey: "chain rule", score: 1 },
      { conceptKey: "chain rule", score: 1 },
    ]);
    expect(scores[0].percent).toBeCloseTo(89, 0);
    expect(scores[0].itemCount).toBe(3);
  });

  it("counts self-marked items in itemCount but not machineScoredCount", () => {
    const scores = scoreSessionByConcept([
      { conceptKey: "chain rule", score: 1, selfMarked: true },
      { conceptKey: "chain rule", score: 1 },
      { conceptKey: "chain rule", score: 1 },
    ]);
    expect(scores[0].itemCount).toBe(3);
    expect(scores[0].machineScoredCount).toBe(2);
  });
});

describe("retirementOutcome", () => {
  it("retires an open concept at exactly 80 percent", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 5, machineScoredCount: 5, percent: 80 }, "open",
    )).toBe("retire");
  });

  it("leaves an open concept below 80 percent", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 3, machineScoredCount: 3, percent: 79.9 }, "open",
    )).toBe("leave_open");
  });

  it("will not retire a perfect score on fewer than three items", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 2, machineScoredCount: 2, percent: 100 }, "open",
    )).toBe("leave_open");
  });

  it("will not retire when self-marking leaves fewer than three machine-scored items", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 4, machineScoredCount: 2, percent: 100 }, "open",
    )).toBe("leave_open");
  });

  it("keeps a retired concept retired when it scores 85 percent despite one miss", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 7, machineScoredCount: 7, percent: 85 }, "retired",
    )).toBe("stay_retired");
  });

  it("reopens a retired concept that scores below 80 percent", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 5, machineScoredCount: 5, percent: 60 }, "retired",
    )).toBe("reopen");
  });

  it("leaves a retired concept alone on evidence too thin to judge", () => {
    expect(retirementOutcome(
      { conceptKey: "c", itemCount: 2, machineScoredCount: 2, percent: 0 }, "retired",
    )).toBe("stay_retired");
  });
});
