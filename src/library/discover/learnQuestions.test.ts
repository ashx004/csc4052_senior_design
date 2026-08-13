import { describe, expect, it, vi, beforeEach } from "vitest";

// learnQuestions.ts imports @/src/library/firebase at module scope, which
// calls getAuth() at import time — mocked so this module can be imported
// without a live Firebase config. Matches blocksPool.test.ts.
vi.mock("@/src/library/firebase", () => ({ db: {} }));

const { generateMissingQuestions } = await import("./learnQuestions");

describe("generateMissingQuestions", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("calls the singular /api/discover/learn-question endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ questions: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await generateMissingQuestions(
      [{ courseId: "c1", classCode: "CSC 101", className: "Intro" }],
      new Map(),
      3
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/discover/learn-question",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("maps generated questions to the LearnQuestion shape with an AI Generated source", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          questions: [
            { type: "true_false", question: "Q1", options: ["True", "False"], correctAnswer: "True" },
          ],
        }),
      })
    );

    const result = await generateMissingQuestions(
      [{ courseId: "c1", classCode: "CSC 101", className: "Intro" }],
      new Map(),
      1
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: "true_false",
      question: "Q1",
      sourceCourse: "AI Generated",
      sourceSet: "Learn Questions",
    });
  });

  it("throws when the response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 502 }));

    await expect(
      generateMissingQuestions([{ courseId: "c1", classCode: "CSC 101", className: "Intro" }], new Map(), 1)
    ).rejects.toThrow("API returned 502");
  });
});
