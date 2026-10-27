import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDoc } from "firebase/firestore";
import { conceptLabelFromQuizName, generateTargetedPracticeQuiz, targetedPracticeName, buildTargetedPracticeRequest, TARGETED_PRACTICE_QUESTION_COUNT, TARGETED_PRACTICE_QUESTION_TYPES } from "./targetedPractice";

vi.mock("firebase/firestore", () => ({ addDoc: vi.fn(async () => ({ id: "new-quiz" })), collection: vi.fn(), serverTimestamp: vi.fn() }));
vi.mock("@/src/library/firebase", () => ({ db: {} }));
vi.mock("@/src/library/chatMode", () => ({ getEffectiveModelKey: () => "model" }));

describe("conceptLabelFromQuizName", () => {
  it("strips known suffixes", () => {
    expect(conceptLabelFromQuizName("Derivatives (new questions)")).toBe("Derivatives");
    expect(conceptLabelFromQuizName("Derivatives (new questions 2)")).toBe("Derivatives");
    expect(conceptLabelFromQuizName("Derivatives (weak-spot practice)")).toBe("Derivatives");
  });

  it("leaves plain names and trims", () => {
    expect(conceptLabelFromQuizName("  Derivatives ")).toBe("Derivatives");
  });

  it("returns empty string for empty name", () => {
    expect(conceptLabelFromQuizName("")).toBe("");
  });
});

describe("targetedPracticeName", () => {
  it("formats a plain concept label", () => {
    expect(targetedPracticeName("Derivatives")).toBe("Derivatives (weak-spot practice)");
  });

  it("strips ' (new questions)' suffix", () => {
    expect(targetedPracticeName("Derivatives (new questions)")).toBe("Derivatives (weak-spot practice)");
  });

  it("strips ' (new questions N)' suffix with trailing number", () => {
    expect(targetedPracticeName("Derivatives (new questions 3)")).toBe("Derivatives (weak-spot practice)");
  });

  it("strips ' (weak-spot practice)' suffix if already present", () => {
    expect(targetedPracticeName("Derivatives (weak-spot practice)")).toBe("Derivatives (weak-spot practice)");
  });

  it("handles case-insensitive suffix stripping", () => {
    expect(targetedPracticeName("Derivatives (NEW QUESTIONS)")).toBe("Derivatives (weak-spot practice)");
  });

  it("falls back to 'Weak spot' for empty label", () => {
    expect(targetedPracticeName("")).toBe("Weak spot (weak-spot practice)");
  });

  it("falls back to 'Weak spot' for whitespace-only label", () => {
    expect(targetedPracticeName("   ")).toBe("Weak spot (weak-spot practice)");
  });
});

describe("buildTargetedPracticeRequest", () => {
  it("builds request with encoded docUrl and derived docName", () => {
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "folder/subfolder/123-derivatives.pdf",
      focus: { quotas: [{ conceptKey: "Derivatives", label: "Derivatives", items: 10 }], avoid: [] },
      avoidQuestions: ["q1", "q2"],
      modelKey: "gpt-4",
    });
    expect(req.docUrl).toBe("/api/download?key=folder%2Fsubfolder%2F123-derivatives.pdf");
    expect(req.docName).toBe("derivatives.pdf");
    expect(req.questionCount).toBe(10);
    expect(req.questionTypes).toEqual(TARGETED_PRACTICE_QUESTION_TYPES);
    expect(req.modelKey).toBe("gpt-4");
    expect(req.avoidQuestions).toEqual(["q1", "q2"]);
    expect(req.difficulty).toBe("exam");
  });

  it("removes leading digits with dash from docName", () => {
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "documents/456-algebra-basics.pdf",
      focus: { quotas: [{ conceptKey: "Algebra", label: "Algebra", items: 10 }], avoid: [] },
      avoidQuestions: [],
      modelKey: "claude-3",
    });
    expect(req.docName).toBe("algebra-basics.pdf");
  });

  it("removes leading digits with underscore from docName", () => {
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "docs/789_calculus_notes.pdf",
      focus: { quotas: [{ conceptKey: "Calculus", label: "Calculus", items: 10 }], avoid: [] },
      avoidQuestions: [],
      modelKey: "model",
    });
    expect(req.docName).toBe("calculus_notes.pdf");
  });

  it("falls back to 'document' for docName when no valid path segment", () => {
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "folder/",
      focus: { quotas: [{ conceptKey: "Topic", label: "Topic", items: 10 }], avoid: [] },
      avoidQuestions: [],
      modelKey: "model",
    });
    expect(req.docName).toBe("document");
  });

  it("preserves avoidQuestions array", () => {
    const avoid = ["q1", "q2", "q3"];
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "file.pdf",
      focus: { quotas: [{ conceptKey: "Topic", label: "Topic", items: 10 }], avoid: [] },
      avoidQuestions: avoid,
      modelKey: "model",
    });
    expect(req.avoidQuestions).toEqual(avoid);
    expect(req.avoidQuestions).not.toBe(avoid); // Should be a copy
  });
});

describe("buildTargetedPracticeRequest focus", () => {
  it("carries the focus so the generator can aim at it", () => {
    const focus = { quotas: [{ conceptKey: "chain rule", label: "Chain Rule", items: 10 }], avoid: ["q1"] };
    const req = buildTargetedPracticeRequest({ sourceDocKey: "file.pdf", focus, avoidQuestions: ["q1"], modelKey: "m" });
    expect(req.focus).toEqual(focus);
  });
});

describe("constants", () => {
  it("exports correct TARGETED_PRACTICE_QUESTION_COUNT", () => {
    expect(TARGETED_PRACTICE_QUESTION_COUNT).toBe(10);
  });

  it("exports correct TARGETED_PRACTICE_QUESTION_TYPES", () => {
    expect(TARGETED_PRACTICE_QUESTION_TYPES).toEqual({
      multipleChoice: true,
      trueFalse: true,
      matching: false,
    });
  });
});

describe("generateTargetedPracticeQuiz focus", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ questions: [{ id: "1" }] }) });
    vi.stubGlobal("fetch", fetchMock);
    vi.mocked(addDoc).mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());
  const sent = () => JSON.parse(fetchMock.mock.calls[0][1].body);

  it("sends the caller's focus as given, with focus.avoid as the avoid list", async () => {
    const focus = {
      quotas: [{ conceptKey: "chain rule", label: "Chain Rule", items: 6 }, { conceptKey: "product rule", label: "Product Rule", items: 4 }],
      avoid: ["asked 1", "asked 2", "asked 3"],
    };
    await generateTargetedPracticeQuiz({ uid: "u", courseId: "c", sourceDocKey: "k/1-a.pdf", focus, avoidQuestions: ["only missed"] });
    expect(sent().focus).toEqual(focus);
    expect(sent().avoidQuestions).toEqual(["asked 1", "asked 2", "asked 3"]);
    expect(vi.mocked(addDoc).mock.calls[0][1]).toMatchObject({ name: "Chain Rule, Product Rule (weak-spot practice)" });
  });

  it("falls back to conceptLabel and avoidQuestions for callers that pass no focus", async () => {
    await generateTargetedPracticeQuiz({ uid: "u", courseId: "c", sourceDocKey: "k/1-a.pdf", conceptLabel: "Derivatives (new questions)", avoidQuestions: ["missed"] });
    expect(sent().focus.quotas).toEqual([{ conceptKey: "derivatives", label: "Derivatives", items: 10 }]);
    expect(sent().avoidQuestions).toEqual(["missed"]);
  });
});
