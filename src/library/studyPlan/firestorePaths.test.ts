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
  documentMasteryCollection,
  documentMasteryPath,
  documentMasteryId,
  learningSuggestionsCollection,
  learningSuggestionPath,
  learningSuggestionId,
  learningActivityEventsCollection,
  learningActivityEventPath,
  learningActivityEventId,
  pendingQuizAttemptsCollection,
  pendingQuizAttemptPath,
  quizSetsCollection,
  quizSetPath,
  quizAttemptsCollection,
  quizAttemptPath,
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

describe("learning progress paths", () => {
  it("builds document mastery, suggestion, and activity-event collections", () => {
    expect(documentMasteryCollection("u1")).toBe("users/u1/documentMastery");
    expect(documentMasteryPath("u1", "doc-hash")).toBe(
      "users/u1/documentMastery/doc-hash"
    );
    expect(learningSuggestionsCollection("u1")).toBe(
      "users/u1/learningSuggestions"
    );
    expect(learningSuggestionPath("u1", "quiz-1")).toBe(
      "users/u1/learningSuggestions/quiz-1"
    );
    expect(learningActivityEventsCollection("u1")).toBe(
      "users/u1/learningActivityEvents"
    );
    expect(learningActivityEventPath("u1", "event-1")).toBe(
      "users/u1/learningActivityEvents/event-1"
    );
  });

  it("builds owner-scoped quiz attempt and pending-attempt paths", () => {
    expect(quizSetsCollection("u1", "course-1")).toBe(
      "users/u1/enrollment/course-1/quizSets"
    );
    expect(quizSetPath("u1", "course-1", "quiz-1")).toBe(
      "users/u1/enrollment/course-1/quizSets/quiz-1"
    );
    expect(quizAttemptsCollection("u1", "course-1", "quiz-1")).toBe(
      "users/u1/enrollment/course-1/quizSets/quiz-1/attempts"
    );
    expect(quizAttemptPath("u1", "course-1", "quiz-1", "attempt-1")).toBe(
      "users/u1/enrollment/course-1/quizSets/quiz-1/attempts/attempt-1"
    );
    expect(pendingQuizAttemptsCollection("u1")).toBe(
      "users/u1/pendingQuizAttempts"
    );
    expect(pendingQuizAttemptPath("u1", "attempt-1")).toBe(
      "users/u1/pendingQuizAttempts/attempt-1"
    );
  });

  it("builds slash-free deterministic suggestion and mastery ids", () => {
    const suggestionA = learningSuggestionId("course-1", "quiz-1");
    const suggestionB = learningSuggestionId("course-2", "quiz-1");
    expect(suggestionA).toBe(learningSuggestionId("course-1", "quiz-1"));
    expect(suggestionA).not.toBe(suggestionB);
    expect(suggestionA.includes("/")).toBe(false);

    const mastery = documentMasteryId("course-1", "notes/chapter 1");
    expect(mastery).toBe(documentMasteryId("course-1", "notes/chapter 1"));
    expect(mastery).not.toBe(documentMasteryId("course-2", "notes/chapter 1"));
    expect(mastery.includes("/")).toBe(false);
    expect(mastery).not.toBe("notes/chapter 1");

    const eventId = learningActivityEventId("reading_finished", "task-1");
    expect(eventId).toBe(learningActivityEventId("reading_finished", "task-1"));
    expect(eventId).not.toBe(
      learningActivityEventId("flashcard_review_finished", "task-1")
    );
    expect(eventId.includes("/")).toBe(false);
  });
});
