import { describe, expect, it } from "vitest";
import { conceptLabelFromQuizName, targetedPracticeName, buildTargetedPracticeRequest, TARGETED_PRACTICE_QUESTION_COUNT, TARGETED_PRACTICE_QUESTION_TYPES } from "./targetedPractice";

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
      conceptLabel: "Derivatives",
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
      conceptLabel: "Algebra",
      avoidQuestions: [],
      modelKey: "claude-3",
    });
    expect(req.docName).toBe("algebra-basics.pdf");
  });

  it("removes leading digits with underscore from docName", () => {
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "docs/789_calculus_notes.pdf",
      conceptLabel: "Calculus",
      avoidQuestions: [],
      modelKey: "model",
    });
    expect(req.docName).toBe("calculus_notes.pdf");
  });

  it("falls back to 'document' for docName when no valid path segment", () => {
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "folder/",
      conceptLabel: "Topic",
      avoidQuestions: [],
      modelKey: "model",
    });
    expect(req.docName).toBe("document");
  });

  it("preserves avoidQuestions array", () => {
    const avoid = ["q1", "q2", "q3"];
    const req = buildTargetedPracticeRequest({
      sourceDocKey: "file.pdf",
      conceptLabel: "Topic",
      avoidQuestions: avoid,
      modelKey: "model",
    });
    expect(req.avoidQuestions).toEqual(avoid);
    expect(req.avoidQuestions).not.toBe(avoid); // Should be a copy
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
