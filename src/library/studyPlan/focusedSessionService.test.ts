import { describe, expect, it } from "vitest";
import type { FocusedSessionResult } from "./closeConceptLoop";
import type { ConceptSessionEvidence } from "./conceptMasteryEngine";
import {
  finishFocusedSession,
  itemsFromPracticeResults,
  itemsFromQuizAttempt,
  type FocusedSessionRepository,
} from "./focusedSessionService";
import type { ConceptWeakSpot } from "./types";

const COURSE_ID = "course-1";

function open(conceptKey: string): ConceptWeakSpot {
  return {
    courseId: COURSE_ID,
    conceptKey,
    label: conceptKey,
    misses: [],
    sourceDocKeys: [],
    status: "open",
    openedAtMs: 1,
    retiredAtMs: null,
    timesReopened: 0,
  };
}

function item(conceptKey: string, score: number) {
  return { conceptKey, score };
}

function session(items: FocusedSessionResult["items"]): FocusedSessionResult {
  return {
    sessionId: "session-1",
    courseId: COURSE_ID,
    kind: "quiz",
    completedAtMs: 1_000,
    items,
  };
}

type FakeRepo = FocusedSessionRepository & {
  saved: ConceptWeakSpot[][];
  savedSessions: ConceptSessionEvidence[];
  savedMastery: { conceptKey: string; value: number; level: string; sourceSessionIds: string[] }[][];
};

function fakeRepo(spots: ConceptWeakSpot[]): FakeRepo {
  const repo: FakeRepo = {
    saved: [],
    savedSessions: [],
    savedMastery: [],
    async listOpen() {
      return spots.filter((spot) => spot.status === "open");
    },
    async listAll() {
      return spots;
    },
    async save(next) {
      repo.saved.push(next);
    },
    async listConceptSessions(_courseId, conceptKeys) {
      return repo.savedSessions.filter((row) => conceptKeys.includes(row.conceptKey));
    },
    async saveConceptSessions(rows) {
      repo.savedSessions.push(...rows);
    },
    async saveConceptMastery(_courseId, values) {
      repo.savedMastery.push(values);
    },
  };
  return repo;
}

describe("itemsFromQuizAttempt", () => {
  it("keeps only questions that carry a conceptKey", () => {
    const items = itemsFromQuizAttempt(
      [{ id: "q1", conceptKey: "chain rule" }, { id: "q2" }],
      [
        { questionId: "q1", selectedAnswer: "a", correctAnswer: "a", isCorrect: true },
        { questionId: "q2", selectedAnswer: "a", correctAnswer: "b", isCorrect: false },
      ],
    );
    expect(items).toEqual([{ conceptKey: "chain rule", score: 1 }]);
  });

  it("scores a wrong answer 0", () => {
    const items = itemsFromQuizAttempt(
      [{ id: "q1", conceptKey: "chain rule" }],
      [{ questionId: "q1", selectedAnswer: "a", correctAnswer: "b", isCorrect: false }],
    );
    expect(items).toEqual([{ conceptKey: "chain rule", score: 0 }]);
  });
});

describe("itemsFromPracticeResults", () => {
  it("passes fractional scores and the self-marked flag through unchanged", () => {
    const items = itemsFromPracticeResults(
      [{ id: "i1", conceptKey: "chain rule" }, { id: "i2", conceptKey: "chain rule" }],
      [{ itemId: "i1", score: 0.67 }, { itemId: "i2", score: 1, selfMarked: true }],
    );
    expect(items).toEqual([
      { conceptKey: "chain rule", score: 0.67 },
      { conceptKey: "chain rule", score: 1, selfMarked: true },
    ]);
  });

  it("drops items with no conceptKey", () => {
    const items = itemsFromPracticeResults(
      [{ id: "i1" }, { id: "i2", conceptKey: "chain rule" }],
      [{ itemId: "i1", score: 1 }, { itemId: "i2", score: 1 }],
    );
    expect(items).toEqual([{ conceptKey: "chain rule", score: 1 }]);
  });

  it("normalises conceptKeys the way the quiz path does", () => {
    const items = itemsFromPracticeResults(
      [{ id: "i1", conceptKey: "  The Chain   Rule " }, { id: "i2", conceptKey: "   " }],
      [{ itemId: "i1", score: 1 }, { itemId: "i2", score: 1 }],
    );
    expect(items).toEqual([{ conceptKey: "chain rule", score: 1 }]);
  });
});

describe("finishFocusedSession", () => {
  it("does not retire a concept on three self-marked correct practice answers", async () => {
    const repo = fakeRepo([open("chain rule")]);
    const items = itemsFromPracticeResults(
      [1, 2, 3].map((n) => ({ id: `i${n}`, conceptKey: "chain rule" })),
      [1, 2, 3].map((n) => ({ itemId: `i${n}`, score: 1, selfMarked: true })),
    );
    const out = await finishFocusedSession(repo, session(items));
    expect(out.retired).toEqual([]);
    expect(repo.saved.flat().some((w) => w.status === "retired")).toBe(false);
  });

  it("saves the updated weak spots and reports what retired", async () => {
    const repo = fakeRepo([open("chain rule")]);
    const out = await finishFocusedSession(repo, session([
      item("chain rule", 1), item("chain rule", 1), item("chain rule", 1),
    ]));
    expect(out.retired).toEqual(["chain rule"]);
    expect(repo.saved[0].find((w) => w.conceptKey === "chain rule")!.status).toBe("retired");
  });

  it("writes one concept session row per scored concept", async () => {
    const repo = fakeRepo([open("chain rule"), open("product rule")]);
    await finishFocusedSession(repo, session([
      item("chain rule", 1), item("product rule", 0),
    ]));
    expect(repo.savedSessions.map((s) => s.conceptKey).sort()).toEqual(["chain rule", "product rule"]);
  });

  it("recomputes and saves mastery for each touched concept", async () => {
    const repo = fakeRepo([open("chain rule")]);
    await finishFocusedSession(repo, session([item("chain rule", 1), item("chain rule", 0)]));
    expect(repo.savedMastery).toHaveLength(1);
    expect(repo.savedMastery[0]).toEqual([
      expect.objectContaining({ conceptKey: "chain rule", value: 50 }),
    ]);
  });

  it("writes no concept session rows for a flashcard session", async () => {
    const repo = fakeRepo([open("chain rule")]);
    await finishFocusedSession(repo, { ...session([item("chain rule", 1)]), kind: "flashcards" });
    expect(repo.savedSessions).toEqual([]);
  });

  it("writes no mastery and no weak spots for a flashcard session", async () => {
    const repo = fakeRepo([open("chain rule")]);
    const out = await finishFocusedSession(repo, { ...session([item("chain rule", 1)]), kind: "flashcards" });
    expect(repo.savedMastery).toEqual([]);
    expect(repo.saved).toEqual([]);
    expect(out).toEqual({ retired: [], reopened: [] });
  });
});
