import { describe, expect, it } from "vitest";
import { isQuizOptionSelected } from "./quizAnswerSelection";

const duplicate = "ACCESS_MOD STATIC FINAL RETURN_TYPE IDENTIFIER";
const unique = "ACCESS_MOD STATIC FINAL RETURN_TYPE IDENTIFIER RBRACE";
const options = [duplicate, unique, duplicate, duplicate];

describe("isQuizOptionSelected", () => {
  it("selects only the clicked index when several options share the same text", () => {
    const selected = options.map((option, optionIndex) =>
      isQuizOptionSelected({
        optionIndex,
        selectedIndex: 2,
        selectedAnswer: duplicate,
        option,
      })
    );

    expect(selected).toEqual([false, false, true, false]);
  });

  it("treats selectedIndex 0 as a real selection, not an unset value", () => {
    expect(
      isQuizOptionSelected({
        optionIndex: 0,
        selectedIndex: 0,
        selectedAnswer: duplicate,
        option: duplicate,
      })
    ).toBe(true);
    expect(
      isQuizOptionSelected({
        optionIndex: 3,
        selectedIndex: 0,
        selectedAnswer: duplicate,
        option: duplicate,
      })
    ).toBe(false);
  });

  it("falls back to matching option text when no index is stored (past attempts)", () => {
    expect(
      isQuizOptionSelected({
        optionIndex: 1,
        selectedIndex: undefined,
        selectedAnswer: unique,
        option: unique,
      })
    ).toBe(true);
    expect(
      isQuizOptionSelected({
        optionIndex: 0,
        selectedIndex: undefined,
        selectedAnswer: unique,
        option: duplicate,
      })
    ).toBe(false);
  });

  it("selects nothing when neither an index nor an answer is set", () => {
    expect(
      isQuizOptionSelected({
        optionIndex: 0,
        selectedIndex: undefined,
        selectedAnswer: undefined,
        option: duplicate,
      })
    ).toBe(false);
  });
});
