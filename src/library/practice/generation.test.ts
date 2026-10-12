import { describe, expect, it } from "vitest";
import { appearsInSource, numberAppearsIn, validateDragDrop, validateFillBlank, validateWordProblems } from "./generation";

const SOURCE = `Mitochondria are the organelles that produce ATP through oxidative phosphorylation. Glycolysis happens in the cytoplasm
and yields a net of 2 ATP per glucose. The electron transport chain pumps protons across the inner membrane. Ribosomes build proteins,
and the Golgi apparatus packages proteins for transport. DNA replication, transcription and translation form the central dogma.`;

const blank = (answer: string, extra: Partial<{ alternatives: string[]; hint: string }> = {}) => ({ answer, alternatives: [], hint: "", ...extra });

describe("appearsInSource", () => {
  const norm = SOURCE.toLowerCase();
  const toks = new Set(norm.split(/[^a-z0-9]+/).filter((w) => w.length > 2));
  it("finds quoted terms, stems and numbers; rejects invented ones", () => {
    expect(appearsInSource("ATP", norm, toks)).toBe(true);
    expect(appearsInSource("oxidative phosphorylation", norm, toks)).toBe(true);
    expect(appearsInSource("organelle", norm, toks)).toBe(true); // stem of "organelles"
    expect(appearsInSource("42", norm, toks)).toBe(true);
    expect(appearsInSource("lysosome", norm, toks)).toBe(false);
  });
});

describe("validateFillBlank", () => {
  const good = { text: "Glycolysis happens in the ____ and yields a net of ____ ATP per glucose.", blanks: [blank("cytoplasm"), blank("2")], explanation: "It happens outside the mitochondria." };

  it("keeps a well-formed question and normalises the blank markers", () => {
    const [item] = validateFillBlank([{ ...good, text: "Glycolysis happens in the _____ and yields a net of [blank] ATP per glucose." }], SOURCE);
    expect(item.text).toBe(good.text);
    expect(item.blanks.map((b) => b.answer)).toEqual(["cytoplasm", "2"]);
    expect(item.kind).toBe("fill_blank");
  });

  it("drops questions whose blank count doesn't match, or that have none or too many", () => {
    expect(validateFillBlank([{ ...good, blanks: [blank("cytoplasm")] }], SOURCE)).toHaveLength(0);
    expect(validateFillBlank([{ ...good, text: "Glycolysis happens in the cytoplasm and yields ATP per glucose.", blanks: [] }], SOURCE)).toHaveLength(0);
    expect(validateFillBlank([{ ...good, text: "A ____ B ____ C ____ D ____ and more words to fill the length.", blanks: [blank("a"), blank("b"), blank("c"), blank("d")] }], SOURCE)).toHaveLength(0);
  });

  it("drops answers that are given away in the sentence or not from the document", () => {
    expect(validateFillBlank([{ ...good, text: "The cytoplasm hosts glycolysis, which happens in the ____ of cells.", blanks: [blank("cytoplasm")] }], SOURCE)).toHaveLength(0);
    expect(validateFillBlank([{ ...good, text: "The organelle that digests waste in animal cells is the ____ of the cell.", blanks: [blank("lysosome")] }], SOURCE)).toHaveLength(0);
  });

  it("drops very long answers and dedupes alternatives", () => {
    expect(validateFillBlank([{ ...good, text: "The electron transport chain pumps ____ across the membrane here today.", blanks: [blank("one two three four five six seven")] }], SOURCE)).toHaveLength(0);
    const [item] = validateFillBlank([{ text: "The ____ build proteins inside the cell, as the document says.", blanks: [blank("Ribosomes", { alternatives: ["ribosomes", "ribosome", "ribosome"], hint: " a clue " })], explanation: "x" }], SOURCE);
    expect(item.blanks[0].alternatives).toEqual(["ribosome"]);
    expect(item.blanks[0].hint).toBe("a clue");
  });
});

describe("validateWordProblems", () => {
  const problem = "A cell breaks down 5 glucose molecules by glycolysis. Each glucose yields a net of 2 ATP. How many net ATP does the cell make in total?";
  const num = { problem, answerType: "number" as const, expectedAnswer: "10", unit: "ATP", keyPoints: [], solution: "5 glucose x 2 net ATP each = 10 ATP." };

  it("keeps a numeric problem whose answer agrees with its worked solution", () => {
    const [item] = validateWordProblems([num]);
    expect(item).toMatchObject({ kind: "word_problem", answerType: "number", expectedAnswer: "10", unit: "ATP", tolerance: 0.01 });
  });
  it("drops numeric problems with a non-number answer or one the solution contradicts", () => {
    expect(validateWordProblems([{ ...num, expectedAnswer: "ten ATP molecules" }])).toHaveLength(1); // "ten" parses to 10 and the solution says 10
    expect(validateWordProblems([{ ...num, expectedAnswer: "lots" }])).toHaveLength(0);
    expect(validateWordProblems([{ ...num, expectedAnswer: "12" }])).toHaveLength(0);
  });
  it("accepts thousands separators in the solution", () => {
    expect(validateWordProblems([{ ...num, expectedAnswer: "1250", solution: "25 x 50 = 1,250." }])).toHaveLength(1);
  });
  it("keeps conceptual problems only with key points and a real model answer", () => {
    const text = { problem: "A student claims glycolysis needs oxygen to run. Explain whether that is right and what happens to the pyruvate afterwards.", answerType: "text" as const, expectedAnswer: "Glycolysis is anaerobic; pyruvate enters the mitochondria if oxygen is present.", unit: "", keyPoints: ["Glycolysis does not need oxygen", "Pyruvate goes to the mitochondria with oxygen"], solution: "Glycolysis occurs in the cytoplasm without oxygen." };
    expect(validateWordProblems([text])).toHaveLength(1);
    expect(validateWordProblems([{ ...text, keyPoints: ["only one"] }])).toHaveLength(0);
    expect(validateWordProblems([{ ...text, expectedAnswer: "Yes." }])).toHaveLength(0);
  });
  it("drops too-short problems", () => {
    expect(validateWordProblems([{ ...num, problem: "How many ATP?" }])).toHaveLength(0);
  });
});

describe("numberAppearsIn", () => {
  it("matches common spellings of the number", () => {
    expect(numberAppearsIn(75, "Total 300 / 4 = 75 km/h")).toBe(true);
    expect(numberAppearsIn(2.5, "so x = 2.5")).toBe(true);
    expect(numberAppearsIn(1250, "25 x 50 = 1,250")).toBe(true);
    expect(numberAppearsIn(0.25, "the ratio is 0.25")).toBe(true);
    expect(numberAppearsIn(76, "so 75")).toBe(false);
  });
});

describe("validateDragDrop", () => {
  const empty = { instructions: "", explanation: "Because.", pairs: [], categories: [], steps: [] };
  const matchRound = { ...empty, mode: "match" as const, pairs: [
    { left: "Mitochondria", right: "Produce ATP" },
    { left: "Ribosomes", right: "Build proteins" },
    { left: "Golgi apparatus", right: "Packages proteins" },
    { left: "Lysosome", right: "Digests waste" },
  ] };

  it("drops match terms that aren't in the document and keeps the round if enough remain", () => {
    const [round] = validateDragDrop([matchRound], SOURCE, ["match"]);
    expect(round.tiles.map((t) => t.label).sort()).toEqual(["Golgi apparatus", "Mitochondria", "Ribosomes"]);
  });
  it("only allows the requested round types", () => {
    expect(validateDragDrop([matchRound], SOURCE, ["sequence"])).toHaveLength(0);
  });
  it("builds sequence and category rounds", () => {
    const sequence = { ...empty, mode: "sequence" as const, steps: ["DNA replication", "Transcription", "Translation"] };
    const categories = { ...empty, mode: "categorize" as const, categories: [
      { name: "Makes things", items: ["Ribosomes", "Mitochondria"] },
      { name: "Moves things", items: ["Golgi apparatus", "Cytoplasm"] },
    ] };
    const rounds = validateDragDrop([sequence, categories], SOURCE, ["sequence", "categorize"]);
    expect(rounds.map((r) => r.mode)).toEqual(["sequence", "categorize"]);
  });
});
