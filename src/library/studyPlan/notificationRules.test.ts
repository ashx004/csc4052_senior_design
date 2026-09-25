import { describe, expect, it } from "vitest";
import {
  isNotificationAllowed,
  buildDedupeKey,
  getNotificationContent,
  shouldThrottle,
} from "./notificationRules";
import type { NotificationPreferences } from "./types";

const allOn: NotificationPreferences = {
  studyReminders: true,
  breakSuggestions: true,
  deadlineWarnings: true,
  progressUpdates: true,
};

describe("isNotificationAllowed", () => {
  it("allows all types when all prefs are on", () => {
    expect(isNotificationAllowed("session_reminder", allOn)).toBe(true);
    expect(isNotificationAllowed("break_suggestion", allOn)).toBe(true);
    expect(isNotificationAllowed("deadline_warning", allOn)).toBe(true);
    expect(isNotificationAllowed("plan_completed", allOn)).toBe(true);
  });

  it("blocks session_reminder when studyReminders is off", () => {
    expect(
      isNotificationAllowed("session_reminder", { ...allOn, studyReminders: false })
    ).toBe(false);
  });

  it("blocks break_suggestion when breakSuggestions is off", () => {
    expect(
      isNotificationAllowed("break_suggestion", { ...allOn, breakSuggestions: false })
    ).toBe(false);
  });

  it("blocks deadline_warning when deadlineWarnings is off", () => {
    expect(
      isNotificationAllowed("deadline_warning", { ...allOn, deadlineWarnings: false })
    ).toBe(false);
  });

  it("blocks plan_completed when progressUpdates is off", () => {
    expect(
      isNotificationAllowed("plan_completed", { ...allOn, progressUpdates: false })
    ).toBe(false);
  });
});

describe("buildDedupeKey", () => {
  it("builds key from type, date, and optional context", () => {
    expect(buildDedupeKey("break_suggestion", "2026-09-20", "sess1")).toBe(
      "break_suggestion:2026-09-20:sess1"
    );
  });

  it("omits context when not provided", () => {
    expect(buildDedupeKey("plan_completed", "2026-09-20")).toBe(
      "plan_completed:2026-09-20"
    );
  });
});

describe("getNotificationContent", () => {
  it("returns supportive text for plan_completed", () => {
    const content = getNotificationContent("plan_completed", {
      completedCount: 3,
    });
    expect(content.title).toContain("Great");
    expect(content.body).toContain("3");
  });

  it("returns supportive text for task_completed", () => {
    const content = getNotificationContent("task_completed", {
      taskTitle: "Quiz: SQL Joins",
    });
    expect(content.body).toContain("SQL Joins");
  });

  it("never uses guilt-based language", () => {
    const types = [
      "session_reminder",
      "incomplete_plan",
      "no_visit_recovery",
      "session_expired",
    ] as const;

    const badPhrases = ["failed", "falling behind", "missed", "you didn't"];

    for (const type of types) {
      const content = getNotificationContent(type, {});
      const combined = `${content.title} ${content.body}`.toLowerCase();
      for (const phrase of badPhrases) {
        expect(combined).not.toContain(phrase);
      }
    }
  });
});

describe("shouldThrottle", () => {
  it("returns false when no recent notifications of same type", () => {
    expect(shouldThrottle("break_suggestion", [], Date.now())).toBe(false);
  });

  it("returns true when same type was sent within 4 hours", () => {
    const now = Date.now();
    const recent = [
      { type: "break_suggestion" as const, createdAt: { toMillis: () => now - 3 * 60 * 60 * 1000 } },
    ];
    expect(shouldThrottle("break_suggestion", recent, now)).toBe(true);
  });

  it("returns false when same type was sent more than 4 hours ago", () => {
    const now = Date.now();
    const recent = [
      { type: "break_suggestion" as const, createdAt: { toMillis: () => now - 5 * 60 * 60 * 1000 } },
    ];
    expect(shouldThrottle("break_suggestion", recent, now)).toBe(false);
  });

  it("ignores different notification types", () => {
    const now = Date.now();
    const recent = [
      { type: "plan_completed" as const, createdAt: { toMillis: () => now - 1000 } },
    ];
    expect(shouldThrottle("break_suggestion", recent, now)).toBe(false);
  });
});
