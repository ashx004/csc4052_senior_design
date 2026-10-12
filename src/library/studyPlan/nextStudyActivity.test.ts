import { describe, expect, it } from "vitest";
import {
  resolveFlashcardNextStep,
  resolveQuizNextStep,
  type FlashcardSetRef,
  type QuizSetRef,
} from "./nextStudyActivity";

function set(
  id: string,
  sourceDocKey: string,
  timestamps: { createdAt?: number | null; updatedAt?: number | null } = {},
): FlashcardSetRef {
  return {
    id,
    sourceDocKey,
    createdAt: timestamps.createdAt ?? null,
    updatedAt: timestamps.updatedAt ?? null,
  };
}

describe("resolveFlashcardNextStep", () => {
  it("opens an existing flashcard set with the same source document", () => {
    expect(resolveFlashcardNextStep("doc-key", [set("set-old", "doc-key")]))
      .toEqual({ action: "open_flashcards", setId: "set-old" });
  });

  it("offers generation when no matching set exists", () => {
    expect(resolveFlashcardNextStep("doc-key", [])).toEqual({ action: "create_flashcards" });
  });

  it("opens the newest matching set by createdAt or updatedAt", () => {
    expect(
      resolveFlashcardNextStep("doc-key", [
        set("set-old", "doc-key", { createdAt: 10, updatedAt: 10 }),
        set("set-new", "doc-key", { createdAt: 20 }),
        set("other", "other-key", { createdAt: 99 }),
      ]),
    ).toEqual({ action: "open_flashcards", setId: "set-new" });

    expect(
      resolveFlashcardNextStep("doc-key", [
        set("set-created", "doc-key", { createdAt: 50 }),
        set("set-updated", "doc-key", { createdAt: 10, updatedAt: 80 }),
      ]),
    ).toEqual({ action: "open_flashcards", setId: "set-updated" });
  });

  it("uses the first match when no timestamps exist", () => {
    expect(
      resolveFlashcardNextStep("doc-key", [
        set("set-first", "doc-key"),
        set("set-second", "doc-key"),
      ]),
    ).toEqual({ action: "open_flashcards", setId: "set-first" });
  });

  it("prefers a dated match over an earlier undated match", () => {
    expect(
      resolveFlashcardNextStep("doc-key", [
        set("set-undated", "doc-key"),
        set("set-dated", "doc-key", { updatedAt: 5 }),
      ]),
    ).toEqual({ action: "open_flashcards", setId: "set-dated" });
  });
});

function quiz(id: string, sourceDocKey: string, createdAtMs: number): QuizSetRef {
  return { id, sourceDocKey, createdAtMs };
}

describe("resolveQuizNextStep", () => {
  it("selects the newest quiz with the same sourceDocKey", () => {
    expect(resolveQuizNextStep("doc-key", [
      quiz("old", "doc-key", 100),
      quiz("new", "doc-key", 200),
      quiz("other", "other-key", 300),
    ])).toMatchObject({ action: "open_quiz", quizId: "new", alternatives: ["old"] });
  });

  it("opens setup when no quiz shares the source document", () => {
    expect(resolveQuizNextStep("doc-key", [])).toEqual({ action: "create_quiz" });
  });
});

describe("sets built from several sources", () => {
  const multi = (id: string, sourceDocKey: string, sourceKeys: string[]): FlashcardSetRef => ({ id, sourceDocKey, sourceKeys });

  it("counts a document as covered when it is any of the set's sources, not just the first", () => {
    const sets = [multi("combo", "doc-a", ["doc-a", "doc-b"])];
    expect(resolveFlashcardNextStep("doc-b", sets)).toEqual({ action: "open_flashcards", setId: "combo" });
    expect(resolveFlashcardNextStep("doc-c", sets)).toEqual({ action: "create_flashcards" });
  });

  it("does the same for quizzes", () => {
    const quizzes: QuizSetRef[] = [{ id: "q1", sourceDocKey: "notebook:n1", sourceKeys: ["doc-a", "doc-b"] }];
    expect(resolveQuizNextStep("doc-b", quizzes)).toMatchObject({ action: "open_quiz", quizId: "q1" });
  });

  it("still works for older sets with no sourceKeys", () => {
    expect(resolveFlashcardNextStep("doc-a", [{ id: "old", sourceDocKey: "doc-a" }])).toEqual({ action: "open_flashcards", setId: "old" });
  });
});
