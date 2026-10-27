import { describe, expect, it } from "vitest";
import { finishNaming, mergeIntoExistingConcept, parseNamingResponse, planNaming, type QuestionToName } from "./conceptNaming";

const ask = (questionId: string): QuestionToName => ({
  questionId,
  question: `Question text for ${questionId}`,
  correctAnswer: "An answer",
});

describe("parseNamingResponse", () => {
  it("maps labels back onto the questions that were asked", () => {
    const out = parseNamingResponse(
      { concepts: [{ questionId: "q1", label: "Chain Rule" }] },
      [ask("q1")],
    );
    expect(out).toEqual([{ questionId: "q1", label: "Chain Rule" }]);
  });

  it("returns a null label for a question the model skipped, never dropping it", () => {
    const out = parseNamingResponse({ concepts: [] }, [ask("q1"), ask("q2")]);
    expect(out).toEqual([
      { questionId: "q1", label: null },
      { questionId: "q2", label: null },
    ]);
  });

  it("returns null labels for every question when the response is malformed", () => {
    expect(parseNamingResponse("not json", [ask("q1")])).toEqual([{ questionId: "q1", label: null }]);
  });

  it("nulls a placeholder label rather than opening a noise weak spot", () => {
    const out = parseNamingResponse(
      { concepts: [{ questionId: "q1", label: "Question 4" }] }, [ask("q1")],
    );
    expect(out).toEqual([{ questionId: "q1", label: null }]);
  });

  it("nulls an empty or non-string label", () => {
    const out = parseNamingResponse(
      { concepts: [{ questionId: "q1", label: "   " }, { questionId: "q2", label: 7 }] },
      [ask("q1"), ask("q2")],
    );
    expect(out).toEqual([
      { questionId: "q1", label: null },
      { questionId: "q2", label: null },
    ]);
  });

  it("ignores labels for questions that were not asked and keeps the asked order", () => {
    const out = parseNamingResponse(
      { concepts: [{ questionId: "zzz", label: "Stray" }, { questionId: "q2", label: "Limits" }] },
      [ask("q1"), ask("q2")],
    );
    expect(out).toEqual([
      { questionId: "q1", label: null },
      { questionId: "q2", label: "Limits" },
    ]);
  });

  it("trims the label", () => {
    const out = parseNamingResponse({ concepts: [{ questionId: "q1", label: "  Chain Rule " }] }, [ask("q1")]);
    expect(out).toEqual([{ questionId: "q1", label: "Chain Rule" }]);
  });
});

describe("mergeIntoExistingConcept", () => {
  it("returns the existing label when the keys already match", () => {
    expect(mergeIntoExistingConcept("the chain rule", [
      { conceptKey: "chain rule", label: "Chain Rule" },
    ])).toBe("Chain Rule");
  });

  it("keeps a genuinely different idea separate", () => {
    expect(mergeIntoExistingConcept("Product Rule", [
      { conceptKey: "chain rule", label: "Chain Rule" },
    ])).toBe("Product Rule");
  });

  it("returns the new label when there is nothing to merge into", () => {
    expect(mergeIntoExistingConcept("Chain Rule", [])).toBe("Chain Rule");
  });
});

describe("planNaming and finishNaming", () => {
  const q = (questionId: string, question = `Text ${questionId}`) => ({ questionId, question, correctAnswer: "a" });

  it("still returns questions past the cap, with null labels", () => {
    const sent = [q("q1"), q("q2"), q("q3")];
    const plan = planNaming(sent, { maxAsked: 2 });
    expect(plan.toAsk.map((x) => x.questionId)).toEqual(["q1", "q2"]);
    const out = finishNaming(plan, [{ questionId: "q1", label: "A" }, { questionId: "q2", label: "B" }], []);
    expect(out).toEqual([
      { questionId: "q1", label: "A" },
      { questionId: "q2", label: "B" },
      { questionId: "q3", label: null },
    ]);
  });

  it("returns empty-text and duplicate-id questions with null labels, in order", () => {
    const plan = planNaming([q("q1"), q("q2", "   "), q("q1", "again"), q("q3")]);
    expect(plan.ids).toEqual(["q1", "q2", "q1", "q3"]);
    expect(plan.toAsk.map((x) => x.questionId)).toEqual(["q1", "q3"]);
    const out = finishNaming(plan, [{ questionId: "q1", label: "A" }, { questionId: "q3", label: "C" }], []);
    expect(out).toEqual([
      { questionId: "q1", label: "A" },
      { questionId: "q2", label: null },
      { questionId: "q1", label: null },
      { questionId: "q3", label: "C" },
    ]);
  });

  it("returns every id with null labels when nothing is askable", () => {
    const plan = planNaming([q("q1", ""), q("q2", " ")]);
    expect(plan.toAsk).toEqual([]);
    expect(finishNaming(plan, [], [])).toEqual([
      { questionId: "q1", label: null },
      { questionId: "q2", label: null },
    ]);
  });

  it("skips entries that have no questionId and merges onto existing concepts", () => {
    const plan = planNaming([null, { question: "x" }, { questionId: " ", question: "x" }, q("q1")]);
    expect(plan.ids).toEqual(["q1"]);
    expect(finishNaming(plan, [{ questionId: "q1", label: "the chain rule" }], [{ conceptKey: "chain rule", label: "Chain Rule" }]))
      .toEqual([{ questionId: "q1", label: "Chain Rule" }]);
  });
});
