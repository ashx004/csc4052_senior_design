import { describe, expect, it } from "vitest";
import { earnedCredit, friendlyWarnings, gradePoints, groupByTerm, summarizeProgress, termSortKey, type CurriculumData, type CurriculumRequirement, type TranscriptCourse } from "./progress";

const course = (over: Partial<TranscriptCourse>): TranscriptCourse => ({ courseCode: "CSC 1000", courseTitle: null, term: "Fall 2023", creditHours: 3, grade: "A", status: "completed", ...over });
const req = (over: Partial<CurriculumRequirement>): CurriculumRequirement => ({
  requirementId: "r", requirementName: "Req", requirementType: "specific-course", numberRequired: null, creditsRequired: null, courseCode: null, courseOptions: [], ...over,
});
const curriculum = (requirements: CurriculumRequirement[], over: Partial<CurriculumData> = {}): CurriculumData => ({ totalDegreeCredits: 120, requirements, ...over });

describe("grades and credit", () => {
  it("scores letter grades and ignores the rest", () => {
    expect(gradePoints("A")).toBe(4);
    expect(gradePoints(" b+ ")).toBe(3.3);
    for (const g of ["P", "CR", "IP", "W", "", null]) expect(gradePoints(g as string | null), String(g)).toBeNull();
  });

  it("counts completed and transfer credit, but not failed, withdrawn or in-progress", () => {
    expect(earnedCredit(course({}))).toBe(true);
    expect(earnedCredit(course({ status: "transfer", grade: "CR" }))).toBe(true);
    expect(earnedCredit(course({ grade: "F" }))).toBe(false);
    expect(earnedCredit(course({ status: "withdrawn", grade: "W" }))).toBe(false);
    expect(earnedCredit(course({ status: "in-progress", grade: "IP" }))).toBe(false);
    expect(earnedCredit(course({ grade: "IP" }))).toBe(false);
  });
});

describe("summarizeProgress totals", () => {
  const transcript = {
    courses: [
      course({ courseCode: "CSC 1000", grade: "A", creditHours: 4 }),
      course({ courseCode: "MAT 1000", grade: "B", creditHours: 4 }),
      course({ courseCode: "ENG 1000", grade: "P", creditHours: 2 }),
      course({ courseCode: "PHY 1000", grade: "F", status: "failed", creditHours: 3 }),
      course({ courseCode: "CSC 2000", grade: "IP", status: "in-progress", creditHours: 3, term: "Fall 2024" }),
    ],
  };
  const summary = summarizeProgress(transcript, curriculum([]));

  it("adds up earned and in-progress credit", () => {
    expect(summary.creditsEarned).toBe(10);
    expect(summary.creditsInProgress).toBe(3);
  });

  it("gives the share of the degree earned", () => {
    expect(summary.creditsRequired).toBe(120);
    expect(summary.percentEarned).toBe(8);
  });

  it("weights GPA by credit hours over graded courses only", () => {
    // (4*4 + 3*4 + 0*3) / 11
    expect(summary.gpa).toBe(2.55);
  });

  it("has no percent when the sheet gave no total, and no GPA when nothing is graded", () => {
    const s = summarizeProgress({ courses: [course({ grade: "P" })] }, curriculum([], { totalDegreeCredits: null }));
    expect(s.percentEarned).toBeNull();
    expect(s.gpa).toBeNull();
  });
});

describe("requirements", () => {
  const transcript = {
    courses: [course({ courseCode: "CSC 1000" }), course({ courseCode: "csc2000", status: "in-progress", grade: "IP" }), course({ courseCode: "MAT 3000" }), course({ courseCode: "MAT 3100" })],
  };

  it("matches a specific course regardless of spacing and case", () => {
    const s = summarizeProgress(transcript, curriculum([
      req({ requirementId: "a", courseCode: "CSC1000" }),
      req({ requirementId: "b", courseCode: "CSC 2000" }),
      req({ requirementId: "c", courseCode: "CSC 3000" }),
    ]));
    expect(s.requirements.map((r) => [r.id, r.state])).toEqual([["a", "done"], ["b", "in-progress"], ["c", "remaining"]]);
    expect(s.counts).toEqual({ done: 1, "in-progress": 1, remaining: 1, review: 0 });
  });

  it("counts how many of a choose-from-list requirement are met", () => {
    const options = ["MAT 3000", "MAT 3100", "MAT 3200"].map((courseCode) => ({ courseCode }));
    const two = summarizeProgress(transcript, curriculum([req({ requirementType: "choose-from-list", numberRequired: 2, courseOptions: options })]));
    expect(two.requirements[0].state).toBe("done");
    const three = summarizeProgress(transcript, curriculum([req({ requirementType: "choose-from-list", numberRequired: 3, courseOptions: options })]));
    expect(three.requirements[0].state).toBe("remaining");
    expect(three.requirements[0].detail).toContain("Choose 1 more");
  });

  it("treats in-progress options as in progress", () => {
    const s = summarizeProgress(transcript, curriculum([req({ requirementType: "choose-from-list", numberRequired: 2, courseOptions: [{ courseCode: "CSC 1000" }, { courseCode: "CSC 2000" }, { courseCode: "CSC 9999" }] })]));
    expect(s.requirements[0].state).toBe("in-progress");
  });

  it("does not guess at requirements that name no courses", () => {
    const s = summarizeProgress(transcript, curriculum([
      req({ requirementId: "x", requirementType: "credit-requirement", creditsRequired: 12 }),
      req({ requirementId: "y", requirementType: "open-elective" }),
      req({ requirementId: "z", requirementType: "choose-from-list", courseOptions: [] }),
    ]));
    expect(s.requirements.every((r) => r.state === "review")).toBe(true);
    expect(s.requirements[0].detail).toContain("12 credits");
  });

  it("adds the student's own concentration, matched by name, and says when it can't", () => {
    const concentrations = [{ concentrationName: "Data Science", requirements: [req({ requirementId: "ds", courseCode: "CSC 1000" })] }];
    const found = summarizeProgress({ ...transcript, concentration: "data science" }, curriculum([], { concentrations }));
    expect(found.requirements.map((r) => [r.id, r.group])).toEqual([["ds", "concentration"]]);
    const missing = summarizeProgress({ ...transcript, concentration: "Robotics" }, curriculum([], { concentrations }));
    expect(missing.requirements).toHaveLength(0);
    expect(missing.attention.join(" ")).toContain("Robotics");
  });
});

describe("terms", () => {
  it("orders terms by calendar and puts credit with no term first", () => {
    expect(termSortKey("Fall 2023")).toBeGreaterThan(termSortKey("Spring 2023"));
    expect(termSortKey("Winter 2024")).toBeGreaterThan(termSortKey("Fall 2023"));
    const groups = groupByTerm([course({ term: "Fall 2023" }), course({ term: "Spring 2023" }), course({ term: null, status: "transfer" })]);
    expect(groups.map((g) => g.label)).toEqual(["No term listed", "Spring 2023", "Fall 2023"]);
  });

  it("totals a term's credit, leaving out courses that earned none", () => {
    const [group] = groupByTerm([course({ creditHours: 3 }), course({ creditHours: 4, grade: "W", status: "withdrawn" })]);
    expect(group.credits).toBe(3);
  });
});

describe("friendlyWarnings", () => {
  it("rewords the unreadable-transfer marker and drops repeats", () => {
    const out = friendlyWarnings(["UNREADABLE_TRANSFER_ROWS: 3 rows totaling 9 credit hours", "Term total differs", "Term total differs"]);
    expect(out).toHaveLength(2);
    expect(out[0]).toContain("3 transfer rows (9 credits)");
    expect(out[0]).not.toContain("UNREADABLE");
  });
});

describe("requirement progress and rules the transcript can settle", () => {
  const courses = [
    course({ courseCode: "CSC 1000", grade: "A", creditHours: 60 }),
    course({ courseCode: "CSC 2000", grade: "C", creditHours: 60 }),
  ];

  it("reports the share of requirements done, not credits", () => {
    const s = summarizeProgress({ courses }, curriculum([
      req({ requirementId: "a", courseCode: "CSC 1000" }),
      req({ requirementId: "b", courseCode: "CSC 9999" }),
    ], { totalDegreeCredits: 100 }));
    expect(s.percentEarned).toBe(100);
    expect(s.percentRequirementsDone).toBe(50);
  });

  it("settles a total-credits requirement from the transcript", () => {
    const total = req({ requirementName: "Total Credit Hours", requirementType: "credit-requirement", creditsRequired: 120 });
    expect(summarizeProgress({ courses }, curriculum([total])).requirements[0].state).toBe("done");
    expect(summarizeProgress({ courses: [courses[0]] }, curriculum([total])).requirements[0]).toMatchObject({ state: "remaining" });
  });

  it("checks a minimum grade and a minimum GPA in one subject", () => {
    const grade = req({ requirementName: "Grade Requirement for CSC Courses", requirementType: "other", description: 'A grade of "C" or higher is required' });
    const gpa = req({ requirementName: "GPA Requirement for CSC Courses", requirementType: "other", description: "Minimum 2.5 GPA" });
    const ok = summarizeProgress({ courses }, curriculum([grade, gpa])).requirements;
    expect(ok.map((r) => r.state)).toEqual(["done", "done"]); // GPA is 3.0
    const weak = [course({ courseCode: "CSC 1000", grade: "D", creditHours: 3 })];
    const bad = summarizeProgress({ courses: weak }, curriculum([grade, gpa])).requirements;
    expect(bad.map((r) => r.state)).toEqual(["remaining", "remaining"]);
  });

  it("leaves a rule to the student when the sheet gives nothing to check", () => {
    const vague = req({ requirementName: "Grade Requirement for CSC Courses", requirementType: "other" });
    const timing = req({ requirementName: "Timing Requirement for MATH 240", requirementType: "other" });
    const states = summarizeProgress({ courses }, curriculum([vague, timing])).requirements.map((r) => r.state);
    expect(states).toEqual(["review", "review"]);
  });
});
