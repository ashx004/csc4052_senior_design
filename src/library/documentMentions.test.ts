import { describe, expect, it } from "vitest";
import { mentionedFileNames, missingDocumentNote } from "./documentMentions";
import { unknownCourseNote } from "./documentMentions";

const docs = [
  { name: "Sorting Algorithms.pdf", classLabel: "CSC 325" },
  { name: "Arrays:Amortized Analysis.pdf", classLabel: "CSC 325" },
  { name: "L4 - Type Systems.pdf", classLabel: "CSC 330" },
  { name: "tset file.zip", classLabel: "CSC 130" },
];

describe("mentionedFileNames", () => {
  it("finds quoted and bare file names", () => {
    expect(mentionedFileNames('Summarize "Heap Sort Lecture.pdf" from CSC 325.')).toEqual(["Heap Sort Lecture.pdf"]);
    expect(mentionedFileNames("make flashcards from Sorting Algorithms.pdf please")).toEqual(["make flashcards from Sorting Algorithms.pdf"]);
    expect(mentionedFileNames('what does "big O" mean')).toEqual([]);
    expect(mentionedFileNames("What's the latest LTS version of Node.js?")).toEqual([]);
    expect(mentionedFileNames('Explain "hugs.py" to me')).toEqual(["hugs.py"]);
  });
});

describe("missingDocumentNote", () => {
  it("flags a file the student doesn't have, with close real matches", () => {
    const note = missingDocumentNote('Summarize "Heap Sort Lecture.pdf" from CSC 325.', docs)!;
    expect(note).toContain('"Heap Sort Lecture.pdf" does NOT exist');
    expect(note).toContain('"Sorting Algorithms.pdf" (CSC 325)');
  });

  it("stays quiet for real files, loose spellings, and messages without files", () => {
    expect(missingDocumentNote('Summarize "L4 - Type Systems.pdf" from CSC 330', docs)).toBeNull();
    expect(missingDocumentNote("make flashcards from Sorting Algorithms.pdf in CSC 325", docs)).toBeNull();
    expect(missingDocumentNote('What is inside "tset file.zip" in CSC 130?', docs)).toBeNull();
    expect(missingDocumentNote("how does quicksort work?", docs)).toBeNull();
  });
});

describe("unknownCourseNote", () => {
  const codes = ["CSC 330", "CSC 130", "CSC 325", "CSC 4753"];
  it("flags a class the student doesn't take", () => {
    expect(unknownCourseNote("Make a 5 question quiz from my CSC 999 lecture notes.", codes)).toMatch(/CSC 999, which isn't one of their classes/);
  });
  it("accepts their own classes however they're written", () => {
    expect(unknownCourseNote("quiz me on csc325 and CSC 4753", codes)).toBeNull();
  });
  it("ignores things that only look like codes", () => {
    expect(unknownCourseNote("Is Python 3.12 or ES 2015 better? Room 240 at 1030", codes)).toBeNull();
    expect(unknownCourseNote("Dr. Cherry's office moved to NETH 240 this term.", codes)).toBeNull();
  });
  it("flags other departments only when used like a class", () => {
    expect(unknownCourseNote("Summarize my PHYS 201 lecture notes", codes)).toMatch(/PHYS 201/);
    expect(unknownCourseNote("I have a PHYS 201 exam soon, add it to my calendar Friday", codes)).toMatch(/PHYS 201/);
  });
});
