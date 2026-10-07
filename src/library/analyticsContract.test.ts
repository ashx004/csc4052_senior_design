import { describe, expect, it } from "vitest";
import {
  eventSchemas,
  normalizeAnalyticsPath,
  analyticsFileType,
} from "./analyticsContract";
import {
  buildReportRequests,
  propertyToday,
  validateDateRange,
} from "./analyticsReportContract";
describe("analytics contract", () => {
  it("removes private routes, queries and fragments", () => {
    expect(
      normalizeAnalyticsPath(
        "/courses/secret/quizzes/secret?email=private#answer",
      ),
    ).toBe("/courses/[courseId]/quizzes/[quizId]");
    expect(normalizeAnalyticsPath("/notes/secret")).toBe("/notes/[noteId]");
    expect(normalizeAnalyticsPath("/unknown/private")).toBe("/other");
    expect(
      eventSchemas.page_view.safeParse({ page_name: "/notes/secret" }).success,
    ).toBe(false);
    expect(
      eventSchemas.page_view.safeParse({ page_name: "/notes/[noteId]" })
        .success,
    ).toBe(true);
  });
  it("keeps public pages distinct from private records", () => {
    expect(normalizeAnalyticsPath("/notes/ocr")).toBe("/notes/ocr");
    expect(normalizeAnalyticsPath("/courses/private/discover/blocks")).toBe(
      "/courses/[courseId]/discover/blocks",
    );
    expect(
      normalizeAnalyticsPath("/courses/private/discover/private-set"),
    ).toBe("/courses/[courseId]/discover/[publicSetId]");
    expect(normalizeAnalyticsPath("/courses/private/notes/")).toBe(
      "/courses/[courseId]/notes",
    );
  });

  it("rejects incomplete and unexpected route shapes", () => {
    const unknownPaths = [
      "/courses//quizzes/private",
      "/courses/private/quizzes/",
      "/notes//",
      "/courses/private/unknown",
      "/courses/private/notes/extra",
      "notes/private",
    ];
    for (const path of unknownPaths) {
      expect(normalizeAnalyticsPath(path)).toBe("/other");
    }
  });

  it("limits strings and rejects private fields", () => {
    expect(analyticsFileType("private-name.PDF")).toBe("pdf");
    expect(analyticsFileType("private.unknown")).toBe("other");
    expect(
      eventSchemas.study_session_started.safeParse({
        task_type: "private text",
      }).success,
    ).toBe(false);
    expect(
      eventSchemas.quiz_completed.safeParse({
        quiz_type: "full_quiz",
        question_count: 2,
        duration_seconds: -1,
      }).success,
    ).toBe(false);
  });
  it("validates dates including calendar validity and maximum range", () => {
    expect(validateDateRange("2026-10-01", "2026-10-05", "2026-10-05")).toEqual(
      { startDate: "2026-10-01", endDate: "2026-10-05" },
    );
    for (const [start, end] of [
      ["2026-02-30", "2026-03-01"],
      ["2026-10-06", "2026-10-06"],
      ["2024-01-01", "2026-01-01"],
      ["2026-10-05", "2026-10-01"],
    ]) {
      expect(() => validateDateRange(start, end, "2026-10-05")).toThrow();
    }
  });
  it("uses the property timezone and only fixed report fields", () => {
    expect(
      propertyToday("America/Chicago", new Date("2026-10-05T02:00:00Z")),
    ).toBe("2026-10-04");
    const queries = buildReportRequests("2026-10-01", "2026-10-05");
    expect(queries).toHaveLength(3);
    expect(queries[0].dimensions).toEqual([{ name: "pageTitle" }]);
    expect(JSON.stringify(queries)).not.toContain("userId");
    expect(queries[2].dimensionFilter).toMatchObject({
      filter: {
        inListFilter: { values: expect.arrayContaining(["quiz_completed"]) },
      },
    });
  });
});
