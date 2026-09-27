import { describe, expect, it } from "vitest";
import { repeatsEarlierQuestion } from "./quizGeneration";

// The live "Type Systems Overview" quiz, and what "New questions" first returned for it.
const OLD = [
  "What is a data type primarily defined as in the document?",
  "In the context of casting, what does the document state about the value 00000000?",
  "The document states that classes, structs, interfaces, enums, and records are all considered data types.",
  "What is the main difference between static and dynamic type systems according to the document?",
  "The document states that C# supports double dispatch for function overloading.",
];

describe("repeatsEarlierQuestion", () => {
  it("catches the live rewordings", () => {
    expect(repeatsEarlierQuestion("What is the main difference between static and dynamic type systems as described in the document?", OLD)).toBe(true);
    expect(repeatsEarlierQuestion("According to the document, what happens when you cast the value 00000000 to a boolean?", OLD)).toBe(true);
    expect(repeatsEarlierQuestion("Does C# support double dispatch when overloading functions?", OLD)).toBe(true);
  });

  it("lets genuinely new questions through", () => {
    expect(repeatsEarlierQuestion("The document states that Hungarian notation is widely used by all developers.", OLD)).toBe(false);
    expect(repeatsEarlierQuestion("Which language feature lets one function name take different parameter lists?", OLD)).toBe(false);
    expect(repeatsEarlierQuestion("What is type inference?", OLD)).toBe(false);
    expect(repeatsEarlierQuestion("What is a strongly typed language?", OLD)).toBe(false);
  });
});
