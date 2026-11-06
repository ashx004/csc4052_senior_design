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

describe("stale study-plan task pruning", () => {
  it("never writes a generated task whose document target is already gone", () => {
    // generateTasks is pure and has no resource list, so attachSelectedDocuments is the
    // first place a document target can be checked against the course's live resources.
    expect(source).toMatch(
      /task\.activityTarget\?\.kind === "document"[\s\S]{0,800}if \(!liveResource\) continue;/,
    );
    // A blank sourceDocKey cannot be looked up, so it must not count as "gone" — otherwise an
    // OCR document whose url is not backfilled yet never gets a study task at all. The same
    // rule is pinned behaviourally for the auto-plan path in autoPlan.test.ts and for the
    // pruner in staleTaskPruning.test.ts.
    expect(source).toContain("isBlankSourceDocKey(task.activityTarget.sourceDocKey)");
  });

  it("runs stale-task pruning on the study-plan surface", () => {
    expect(source).toContain("partitionPlanTasks");
  });

  it("reads each course's contents through the library helper, not inline", () => {
    // The catch-stores-null rule used to live inline here, where no test could observe what a
    // failed read actually stored. It now lives in loadCourseContents, whose own tests in
    // src/library/studyPlan/courseContents.test.ts prove the behaviour (a throw, an
    // unreachable server and a partial failure all store null). All this file still has to
    // pin is that the component delegates rather than keeping a second copy of the read.
    expect(source).toContain("loadCourseContents(uid, classes.map((cls) => cls.id))");
    expect(source).not.toMatch(/getDocs\w*\(\s*collection\(db, "users", uid, "enrollment"/);
  });

  it("only prunes the current plan's tasks, guarded so it runs once per plan load", () => {
    expect(source).toContain("prunedPlanDateRef");
    expect(source).toMatch(/partitionPlanTasks\(\s*planTasks/);
  });

  it("reduces totalTasks by the number pruned and leaves the other counters alone", () => {
    const update = source.match(/await updatePlanState\(\{[\s\S]{0,400}?\}\);/g) ?? [];
    const pruneUpdate = update.find((call) => call.includes("removed.length"));
    expect(pruneUpdate).toBeDefined();
    expect(pruneUpdate).toContain("totalTasks");
    expect(pruneUpdate).not.toContain("completedCount");
    expect(pruneUpdate).not.toContain("skippedCount");
  });

  it("clears a missing generated set instead of deleting the task", () => {
    expect(source).toContain("clearMissingGeneratedSet(uid, task.id, target.generatedSetId)");
  });
});

describe("document topics", () => {
  it("builds document topics for every course, with no per-course gate", () => {
    // The first statement in the loop body must be the helper call: a guard placed above it
    // (whatever its spelling) would skip courses that already have sets. What the helper then
    // returns is pinned behaviourally in documentTopics.test.ts.
    expect(source).toMatch(
      /for \(const (\w+) of classes\) \{\s*topics\.push\(\s*\.\.\.documentTopicsForCourse\(/,
    );
  });

  it("de-duplicates a document already behind a set, by matching the source key variants", () => {
    expect(source.match(/representedByCourse\.get\(cls\.id\)\?\.add\(matched\.id\)/g) ?? []).toHaveLength(2);
    expect(source).toMatch(/representedResourceIds: representedByCourse\.get\(cls\.id\)/);
  });
});
