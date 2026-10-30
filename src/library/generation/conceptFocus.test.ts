import { describe, expect, it } from "vitest";
import { conceptFocusPrompt, mergeAvoid, parseConceptFocus, tagFocusedQuestions } from "./conceptFocus";

describe("tagFocusedQuestions", () => {
  const focus = {
    quotas: [{ conceptKey: "chain rule", label: "Chain Rule", items: 3 }],
    avoid: [],
  };

  it("replaces the model's free-text concept with the focus label for a matching conceptKey", () => {
    const tagged = tagFocusedQuestions(
      [{ id: "q1", concept: "Chain rule for composites", conceptKey: " The Chain Rule " }],
      focus,
    );
    expect(tagged).toEqual([{ id: "q1", concept: "Chain Rule", conceptKey: "chain rule" }]);
  });

  it("leaves questions without a focused conceptKey unchanged", () => {
    const questions = [
      { id: "q1", concept: "Limits", conceptKey: "limits" },
      { id: "q2", concept: "Derivatives" },
    ];
    expect(tagFocusedQuestions(questions, focus)).toEqual(questions);
  });
});

describe("conceptFocusPrompt", () => {
  it("names each concept and how many items it needs", () => {
    const text = conceptFocusPrompt({
      quotas: [
        { conceptKey: "chain rule", label: "Chain Rule", items: 7 },
        { conceptKey: "product rule", label: "Product Rule", items: 3 },
      ],
      avoid: [],
    });
    expect(text).toContain("Chain Rule");
    expect(text).toContain("7");
    expect(text).toContain("Product Rule");
    expect(text).toContain("3");
  });

  it("tags every item with the concept it belongs to", () => {
    const text = conceptFocusPrompt({
      quotas: [{ conceptKey: "chain rule", label: "Chain Rule", items: 3 }], avoid: [],
    });
    expect(text).toContain("conceptKey");
  });

  it("is empty when there are no quotas, so unfocused generation is unchanged", () => {
    expect(conceptFocusPrompt({ quotas: [], avoid: [] })).toBe("");
  });
});

describe("mergeAvoid", () => {
  it("joins lists, dropping blanks and repeats", () => {
    expect(mergeAvoid(["a", "b"], undefined, ["b", " ", "c"])).toEqual(["a", "b", "c"]);
  });
});

describe("parseConceptFocus", () => {
  it("keeps valid quotas and avoid texts", () => {
    expect(
      parseConceptFocus({ quotas: [{ conceptKey: "k", label: "K", items: 4 }], avoid: ["q", 3, " "] }),
    ).toEqual({ quotas: [{ conceptKey: "k", label: "K", items: 4 }], avoid: ["q"] });
  });

  it("drops malformed quotas, and returns undefined when none are usable", () => {
    expect(parseConceptFocus({ quotas: [{ conceptKey: "k", label: "K", items: 0 }, "x"], avoid: [] })).toBeUndefined();
    expect(parseConceptFocus("nope")).toBeUndefined();
    expect(parseConceptFocus(undefined)).toBeUndefined();
  });
});

describe("per-concept level", () => {
  it("states each concept's level in the prompt", () => {
    const prompt = conceptFocusPrompt({
      quotas: [
        { conceptKey: "recursion", label: "Recursion", items: 2, level: "review" },
        { conceptKey: "big-o", label: "Big O", items: 2, level: "challenge" },
      ],
      avoid: [],
    });
    expect(prompt).toContain("Recursion");
    expect(prompt).toContain('"review" level');
    expect(prompt).toContain("Big O");
    expect(prompt).toContain('"challenge" level');
  });

  it("keeps the prompt for quotas without a level exactly as it was", () => {
    const quotas = [{ conceptKey: "recursion", label: "Recursion", items: 2 }];
    expect(conceptFocusPrompt({ quotas, avoid: [] })).toBe(
      '\n\nFocus this set on the following concepts, with the number of items each needs:\n' +
        '- Recursion (conceptKey: "recursion"): exactly 2 items\n\n' +
        'Every generated item must include a "conceptKey" field whose value is exactly one of the conceptKey strings above, naming the concept that item tests. Do not invent other conceptKey values.',
    );
  });

  it("parses a valid level", () => {
    const parsed = parseConceptFocus({ quotas: [{ conceptKey: "a", label: "A", items: 1, level: "challenge" }] });
    expect(parsed?.quotas[0].level).toBe("challenge");
  });

  it("drops an unknown or missing level instead of keeping it", () => {
    expect(parseConceptFocus({ quotas: [{ conceptKey: "a", label: "A", items: 1, level: "impossible" }] })?.quotas[0].level).toBeUndefined();
    expect(parseConceptFocus({ quotas: [{ conceptKey: "a", label: "A", items: 1 }] })?.quotas[0].level).toBeUndefined();
  });
});
