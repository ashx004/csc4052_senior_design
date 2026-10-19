import { describe, expect, it } from "vitest";
import { MAX_QUIZ_RESULT_QUESTIONS, pageContextSchema } from "./contextualAi";
import { MAX_QUIZ_QUESTIONS } from "../quizGeneration";

describe("quiz result page context", () => {
  it("accepts as many questions as a quiz can have", () => {
    expect(MAX_QUIZ_RESULT_QUESTIONS).toBe(MAX_QUIZ_QUESTIONS);
    const questions = Array.from({ length: MAX_QUIZ_QUESTIONS }, (_, i) => ({ question: `Q${i}`, selectedAnswer: "a", correctAnswer: "b", isCorrect: i % 2 === 0 }));
    const ctx = { kind: "quiz_result", courseId: "c1", quizName: "Quiz", score: 25, total: MAX_QUIZ_QUESTIONS, questions };
    expect(pageContextSchema.safeParse(ctx).success).toBe(true);
  });
});
