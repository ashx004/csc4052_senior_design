import { describe, expect, it } from "vitest";
import { errorFingerprint, normalizeMessage, normalizeRoute } from "./errorFingerprint";

describe("errorFingerprint", () => {
  it("groups the same bug even when ids and numbers differ", () => {
    const a = errorFingerprint("server", 'Course "Biology 101" not found (uid xY7kP2mQ9rT4vW1zA3bC)', "/api/courses/[courseId]");
    const b = errorFingerprint("server", 'Course "Chem 2" not found (uid Q1w2E3r4T5y6U7i8O9p0)', "/api/courses/[courseId]");
    expect(a).toBe(b);
  });

  it("keeps different messages, routes and sources apart", () => {
    const base = errorFingerprint("server", "Quiz generation failed", "/api/generate-quiz");
    expect(errorFingerprint("server", "Flashcard generation failed", "/api/generate-quiz")).not.toBe(base);
    expect(errorFingerprint("server", "Quiz generation failed", "/api/generate-flashcards")).not.toBe(base);
    expect(errorFingerprint("client", "Quiz generation failed", "/api/generate-quiz")).not.toBe(base);
  });

  it("normalizes concrete paths to the same group", () => {
    expect(normalizeRoute("/courses/abc123def456ghi789jk/quizzes/9?tab=1")).toBe("/courses/:id/quizzes/:id");
    expect(normalizeRoute("/api/courses/[courseId]")).toBe("/api/courses/[courseId]");
  });

  it("strips urls and uuids from messages", () => {
    expect(normalizeMessage("fetch https://x.test/a?b=1 failed for 123e4567-e89b-12d3-a456-426614174000")).toBe(
      "fetch <url> failed for <id>",
    );
  });
});
