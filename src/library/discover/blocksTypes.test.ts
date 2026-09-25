// src/library/discover/blocksTypes.test.ts
import { describe, expect, it } from "vitest";
import {
  isMatchingQuestion,
  isSingleQuestion,
  BOARD_SIZE,
  CLEAR_ANIMATION_MS,
  HAND_SIZE,
  MAX_HEARTS,
  POOL_TOPUP_THRESHOLD,
  PIECE_COLORS,
} from "./blocksTypes";
import type { BlocksQuestion } from "./blocksTypes";

const single: BlocksQuestion = {
  id: "q1",
  kind: "single",
  type: "multiple_choice",
  question: "What is 2+2?",
  options: ["3", "4", "5", "6"],
  correctAnswer: "4",
  sourceCourse: "CSC 101",
  sourceSet: "Arithmetic",
};

const matching: BlocksQuestion = {
  id: "q2",
  kind: "matching",
  sourceCourse: "CSC 101",
  sourceSet: "Vocabulary",
  pairs: [
    { id: "p1", term: "A", definition: "Apple" },
    { id: "p2", term: "B", definition: "Banana" },
    { id: "p3", term: "C", definition: "Cherry" },
  ],
};

describe("blocksTypes constants", () => {
  it("defines the board/hand/hearts/top-up sizes from the spec", () => {
    expect(BOARD_SIZE).toBe(8);
    expect(HAND_SIZE).toBe(4);
    expect(MAX_HEARTS).toBe(3);
    expect(POOL_TOPUP_THRESHOLD).toBe(5);
    expect(CLEAR_ANIMATION_MS).toBe(600);
    expect(PIECE_COLORS.length).toBeGreaterThan(0);
  });
});

describe("isSingleQuestion", () => {
  it("returns true for a single question", () => {
    expect(isSingleQuestion(single)).toBe(true);
  });

  it("returns false for a matching question", () => {
    expect(isSingleQuestion(matching)).toBe(false);
  });
});

describe("isMatchingQuestion", () => {
  it("returns true for a matching question", () => {
    expect(isMatchingQuestion(matching)).toBe(true);
  });

  it("returns false for a single question", () => {
    expect(isMatchingQuestion(single)).toBe(false);
  });
});
