import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDocs: vi.fn(),
  addDoc: vi.fn(),
}));

vi.mock("@/src/library/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  addDoc: mocks.addDoc,
  arrayUnion: vi.fn(),
  collection: (...path: unknown[]) => ({ path }),
  doc: (...path: unknown[]) => ({ path }),
  getDoc: vi.fn(),
  getDocs: mocks.getDocs,
  increment: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: () => "ts",
  updateDoc: vi.fn(),
}));
vi.mock("@/src/library/chatMode", () => ({ getEffectiveModelKey: () => "model-1" }));

import { askedQuestionTexts, generateConceptQuiz } from "./weakConceptPractice";

/** A stored quiz set, as getDocs hands it back. */
function quizSet(sourceDocKey: string, createdAt: number, questions: string[]) {
  return { data: () => ({ sourceDocKey, createdAt, questions: questions.map((question) => ({ question })) }) };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("askedQuestionTexts", () => {
  it("returns every matching set's questions, newest set first", async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        quizSet("doc-1", 100, ["Oldest?"]),
        quizSet("doc-1", 300, ["Newest?"]),
        quizSet("doc-2", 400, ["Other document?"]),
        quizSet("doc-1", 200, ["Middle?"]),
      ],
    });

    expect(await askedQuestionTexts("u1", "c1", ["doc-1"])).toEqual(["Newest?", "Middle?", "Oldest?"]);
  });

  it("keeps only the newest sets when maxSets bounds it", async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        quizSet("doc-1", 100, ["Oldest?"]),
        quizSet("doc-1", 300, ["Newest?"]),
        quizSet("doc-1", 200, ["Middle?"]),
      ],
    });

    expect(await askedQuestionTexts("u1", "c1", ["doc-1"], { maxSets: 2 })).toEqual(["Newest?", "Middle?"]);
  });

  it("sorts a set saved before createdAt existed last instead of throwing", async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ sourceDocKey: "doc-1", questions: [{ question: "Legacy?" }] }) },
        quizSet("doc-1", 50, ["Dated?"]),
      ],
    });

    expect(await askedQuestionTexts("u1", "c1", ["doc-1"], { maxSets: 1 })).toEqual(["Dated?"]);
  });

  it("reads a Firestore timestamp object as its millis", async () => {
    mocks.getDocs.mockResolvedValue({
      docs: [
        { data: () => ({ sourceDocKey: "doc-1", createdAt: { toMillis: () => 10 }, questions: [{ question: "Older?" }] }) },
        { data: () => ({ sourceDocKey: "doc-1", createdAt: { toMillis: () => 20 }, questions: [{ question: "Newer?" }] }) },
      ],
    });

    expect(await askedQuestionTexts("u1", "c1", ["doc-1"], { maxSets: 1 })).toEqual(["Newer?"]);
  });
});

describe("generateConceptQuiz", () => {
  const focus = { quotas: [{ conceptKey: "joins", label: "Joins", items: 3, level: "review" as const }], avoid: [] };

  beforeEach(() => {
    mocks.addDoc.mockResolvedValue({ id: "set-1" });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ questions: [{ id: "q1", question: "What is a join?", correctAnswer: "A" }] }),
      }),
    );
  });

  it("pins the set and names it weak-spot practice for the quiz page's modal", async () => {
    await generateConceptQuiz({ uid: "u1", courseId: "c1", sourceDocKey: "doc-1", focus, pinned: true });

    const saved = mocks.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(saved.pinned).toBe(true);
    expect(saved.name).toBe("Joins (weak-spot practice)");
    expect(saved).not.toHaveProperty("generatedForPlan");
  });

  it("leaves a daily plan set unpinned, marks it and gives it a daily name", async () => {
    await generateConceptQuiz({
      uid: "u1",
      courseId: "c1",
      sourceDocKey: "doc-1",
      focus,
      pinned: false,
      generatedForPlan: true,
    });

    const saved = mocks.addDoc.mock.calls[0][1] as Record<string, unknown>;
    expect(saved.pinned).toBe(false);
    expect(saved.generatedForPlan).toBe(true);
    expect(saved.name).toBe("Joins (daily practice)");
  });
});
