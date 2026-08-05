import { describe, expect, it } from "vitest";
import { filterCourses, getDepartments, paginate, recommendCourses, AdvisingCourse } from "./recommend";
import { CourseOfferingRecord } from "@/src/library/courseOfferings";
import { Term } from "@/src/library/academicTerm";

function emptyTerms(): Record<Term, { offered: boolean; years: number[] }> {
  return {
    Fall: { offered: false, years: [] },
    Winter: { offered: false, years: [] },
    Spring: { offered: false, years: [] },
    Summer: { offered: false, years: [] },
  };
}

function course(
  courseCode: string,
  title: string,
  overrides: Partial<Record<Term, { offered: boolean; years: number[] }>>
): CourseOfferingRecord {
  return { courseCode, title, offeredTerms: { ...emptyTerms(), ...overrides } };
}

describe("recommendCourses", () => {
  it("excludes a course the student has already taken", () => {
    const courses = [course("CSC 4550", "Senior Design", { Fall: { offered: true, years: [2026] } })];
    const result = recommendCourses(courses, [{ classCode: "CSC 4550" }], { term: "Fall", year: 2026 });
    expect(result.recommended).toHaveLength(0);
    expect(result.otherLikely).toHaveLength(0);
  });

  it("matches taken courses regardless of spacing/case", () => {
    const courses = [course("csc-4550", "Senior Design", { Fall: { offered: true, years: [2026] } })];
    const result = recommendCourses(courses, [{ classCode: "CSC4550" }], { term: "Fall", year: 2026 });
    expect(result.recommended).toHaveLength(0);
  });

  it("excludes a course not offered in the target term", () => {
    const courses = [course("CSC 4550", "Senior Design", { Spring: { offered: true, years: [2026] } })];
    const result = recommendCourses(courses, [], { term: "Fall", year: 2026 });
    expect(result.recommended.concat(result.otherLikely)).toHaveLength(0);
  });

  it("falls back to 'offered in 2+ of the last 3 years' when the target year isn't listed yet", () => {
    const courses = [course("CSC 4550", "Senior Design", { Fall: { offered: true, years: [2023, 2024] } })];
    const result = recommendCourses(courses, [], { term: "Fall", year: 2026 });
    expect(result.recommended.concat(result.otherLikely)).toHaveLength(1);
  });

  it("excludes a course offered in only 1 of the last 3 years when the target year isn't listed", () => {
    const courses = [course("CSC 4550", "Senior Design", { Fall: { offered: true, years: [2024] } })];
    const result = recommendCourses(courses, [], { term: "Fall", year: 2026 });
    expect(result.recommended.concat(result.otherLikely)).toHaveLength(0);
  });

  it("buckets same-department courses as recommended and others as otherLikely", () => {
    const courses = [
      course("CSC 4550", "Senior Design", { Fall: { offered: true, years: [2026] } }),
      course("MATH 2010", "Calculus", { Fall: { offered: true, years: [2026] } }),
    ];
    const result = recommendCourses(courses, [{ classCode: "CSC 1234" }], { term: "Fall", year: 2026 });
    expect(result.recommended.map((c) => c.courseCode)).toEqual(["CSC 4550"]);
    expect(result.otherLikely.map((c) => c.courseCode)).toEqual(["MATH 2010"]);
  });

  it("reports totalConsidered as the full input count regardless of filtering", () => {
    const courses = [course("CSC 4550", "Senior Design", {})];
    const result = recommendCourses(courses, [], { term: "Fall", year: 2026 });
    expect(result.totalConsidered).toBe(1);
  });
});

describe("filterCourses", () => {
  const courses: AdvisingCourse[] = [
    {
      courseCode: "CSC 4550",
      title: "Senior Design",
      department: "CSC",
      relevanceReason: "new",
      yearsOfferedThisTerm: [2026],
      offeredTerms: emptyTerms(),
    },
    {
      courseCode: "MATH 2010",
      title: "Calculus",
      department: "MATH",
      relevanceReason: "new",
      yearsOfferedThisTerm: [2026],
      offeredTerms: emptyTerms(),
    },
  ];

  it("filters by department", () => {
    expect(filterCourses(courses, undefined, "MATH").map((c) => c.courseCode)).toEqual(["MATH 2010"]);
  });

  it("filters by a case-insensitive query against code or title", () => {
    expect(filterCourses(courses, "senior").map((c) => c.courseCode)).toEqual(["CSC 4550"]);
    expect(filterCourses(courses, "csc").map((c) => c.courseCode)).toEqual(["CSC 4550"]);
  });

  it("returns everything when no filters are given", () => {
    expect(filterCourses(courses)).toHaveLength(2);
  });
});

describe("paginate", () => {
  const items = Array.from({ length: 25 }, (_, i) => i);

  it("returns the first page", () => {
    expect(paginate(items, 1, 10).items).toEqual(items.slice(0, 10));
  });

  it("returns a middle page", () => {
    expect(paginate(items, 2, 10).items).toEqual(items.slice(10, 20));
  });

  it("returns a partial final page", () => {
    expect(paginate(items, 3, 10).items).toEqual(items.slice(20, 25));
  });

  it("reports the total regardless of page", () => {
    expect(paginate(items, 1, 10).total).toBe(25);
  });

  it("clamps a non-positive page to the first page instead of a negative slice start", () => {
    expect(paginate(items, 0, 10).items).toEqual(items.slice(0, 10));
  });
});

describe("getDepartments", () => {
  it("returns the unique, sorted set of departments", () => {
    const courses: AdvisingCourse[] = [
      { courseCode: "b", title: "", department: "MATH", relevanceReason: "new", yearsOfferedThisTerm: [], offeredTerms: emptyTerms() },
      { courseCode: "a", title: "", department: "CSC", relevanceReason: "new", yearsOfferedThisTerm: [], offeredTerms: emptyTerms() },
      { courseCode: "c", title: "", department: "CSC", relevanceReason: "new", yearsOfferedThisTerm: [], offeredTerms: emptyTerms() },
    ];
    expect(getDepartments(courses)).toEqual(["CSC", "MATH"]);
  });
});
