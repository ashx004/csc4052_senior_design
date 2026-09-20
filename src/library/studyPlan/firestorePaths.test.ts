import { describe, expect, it } from "vitest";
import {
  studyPlanPath,
  studyTasksCollection,
  studyTaskPath,
  studySessionsCollection,
  studySessionPath,
  masterySignalsCollection,
  masterySignalPath,
  studyNotificationsCollection,
  notificationPrefsPath,
  cardEngagementPath,
} from "./firestorePaths";

describe("studyPlanPath", () => {
  it("builds path from uid and date string", () => {
    expect(studyPlanPath("user1", "2026-09-20")).toBe(
      "users/user1/studyPlans/2026-09-20"
    );
  });
});

describe("studyTasksCollection", () => {
  it("builds collection path from uid", () => {
    expect(studyTasksCollection("user1")).toBe("users/user1/studyTasks");
  });
});

describe("studyTaskPath", () => {
  it("builds document path from uid and taskId", () => {
    expect(studyTaskPath("user1", "task123")).toBe(
      "users/user1/studyTasks/task123"
    );
  });
});

describe("studySessionsCollection", () => {
  it("builds collection path from uid", () => {
    expect(studySessionsCollection("user1")).toBe("users/user1/studySessions");
  });
});

describe("studySessionPath", () => {
  it("builds document path from uid and sessionId", () => {
    expect(studySessionPath("user1", "sess456")).toBe(
      "users/user1/studySessions/sess456"
    );
  });
});

describe("masterySignalsCollection", () => {
  it("builds collection path from uid", () => {
    expect(masterySignalsCollection("user1")).toBe(
      "users/user1/masterySignals"
    );
  });
});

describe("masterySignalPath", () => {
  it("builds document path from uid and signalId", () => {
    expect(masterySignalPath("user1", "courseA_topic1_quiz_mastery")).toBe(
      "users/user1/masterySignals/courseA_topic1_quiz_mastery"
    );
  });
});

describe("studyNotificationsCollection", () => {
  it("builds collection path from uid", () => {
    expect(studyNotificationsCollection("user1")).toBe(
      "users/user1/studyNotifications"
    );
  });
});

describe("notificationPrefsPath", () => {
  it("builds settings document path from uid", () => {
    expect(notificationPrefsPath("user1")).toBe(
      "users/user1/settings/studyNotifications"
    );
  });
});

describe("cardEngagementPath", () => {
  it("builds nested path from uid, courseId, setId, and cardIndex", () => {
    expect(cardEngagementPath("user1", "course1", "set1", "0")).toBe(
      "users/user1/enrollment/course1/flashcardSets/set1/cardEngagement/0"
    );
  });
});
