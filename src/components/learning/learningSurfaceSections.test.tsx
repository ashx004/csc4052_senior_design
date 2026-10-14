import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = readFileSync(
  resolve(process.cwd(), "src/components/learning/LearningWorkspace.tsx"),
  "utf8",
);

describe("LearningWorkspace section scoping", () => {
  it("no longer imports or renders HeroBanner", () => {
    expect(source).not.toContain("HeroBanner");
  });

  it("scopes recommended suggestions to the study plan surface", () => {
    expect(source).toContain('surface === "study-plan" && recommendedSuggestions.length > 0');
  });

  it("scopes custom study material to the study plan surface", () => {
    expect(source).toContain('surface === "study-plan" && user && <CustomSetsSection');
  });

  it("scopes mastery detail to the classes surface", () => {
    expect(source).toContain('surface === "classes" &&');
    expect(source).toContain("mastery-detail-heading");
  });

  it("keeps the existing deep-link redirects to the study plan route", () => {
    expect(source).toContain('router.replace(`${LEARNING_ROUTES["study-plan"]}');
  });

  it("renders WeeklyChickenChart nowhere (the landing view owns it)", () => {
    expect(source.match(/<WeeklyChickenChart/g) ?? []).toHaveLength(0);
  });

  it("renders HeroBanner nowhere", () => {
    expect(source.match(/HeroBanner/g) ?? []).toHaveLength(0);
  });

  it("renders StatCards nowhere (the landing view owns it)", () => {
    expect(source.match(/<StatCards/g) ?? []).toHaveLength(0);
  });

  it.each([
    "<CustomSetsSection",
    "<PlanCompletedState",
    "<PlanStarter",
  ])("renders %s only behind a study-plan guard", (tag) => {
    const tagPattern = new RegExp(`${tag}(?![A-Za-z])`, "g");
    expect(source.match(tagPattern) ?? []).toHaveLength(1);
    const before = source.slice(0, source.search(tagPattern));
    const guardStart = before.lastIndexOf("{surface ===");
    expect(guardStart).toBeGreaterThan(-1);
    expect(before.slice(guardStart)).toMatch(/^\{surface === "study-plan"/);
  });

  it.each(['autoPlanStatus === "running"', 'autoPlanStatus === "error"', 'autoPlanStatus === "empty"'])(
    "scopes the %s message to the study plan surface",
    (cond) => {
      expect(source).toContain(`{surface === "study-plan" && ${cond}`);
    },
  );
});
