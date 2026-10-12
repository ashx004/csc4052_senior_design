import { describe, expect, it } from "vitest";
import { PALETTE, PLACEHOLDER, insertSnippet, nextPlaceholder } from "./equationBuilder";

const box = (text: string) => text.slice(0, 0) + PLACEHOLDER;

describe("PALETTE", () => {
  it("has unique, non-empty entries in every group", () => {
    for (const group of PALETTE) {
      expect(group.items.length).toBeGreaterThan(0);
      const labels = group.items.map((i) => i.label);
      expect(new Set(labels).size).toBe(labels.length);
      for (const item of group.items) expect(item.latex.trim()).not.toBe("");
    }
  });

  it("has balanced braces in every template", () => {
    for (const item of PALETTE.flatMap((g) => g.items)) {
      const stripped = item.latex.replace(/\\[{}]/g, "");
      let depth = 0;
      for (const ch of stripped) {
        if (ch === "{") depth += 1;
        if (ch === "}") depth -= 1;
        expect(depth).toBeGreaterThanOrEqual(0);
      }
      expect(depth).toBe(0);
    }
  });
});

describe("insertSnippet", () => {
  it("inserts a template at the caret and selects its first empty box", () => {
    const edit = insertSnippet("x = ", 4, 4, "\\frac{\\square}{\\square}");
    expect(edit.text).toBe("x = \\frac{\\square}{\\square}");
    expect(edit.text.slice(edit.start, edit.end)).toBe(PLACEHOLDER);
    expect(edit.start).toBe("x = \\frac{".length);
  });

  it("puts selected text into the template's first box", () => {
    const edit = insertSnippet("a+b", 0, 3, "\\sqrt{\\square}");
    expect(edit.text).toBe("\\sqrt{a+b}");
    // No empty box is left, so the caret goes after what was added.
    expect(edit.start).toBe(edit.end);
    expect(edit.end).toBe(edit.text.length);
  });

  it("moves on to the next empty box after filling the first with a selection", () => {
    const edit = insertSnippet("x", 0, 1, "\\frac{\\square}{\\square}");
    expect(edit.text).toBe("\\frac{x}{\\square}");
    expect(edit.text.slice(edit.start, edit.end)).toBe(PLACEHOLDER);
  });

  it("puts the caret after a plain symbol", () => {
    const edit = insertSnippet("a  b", 2, 2, "\\leq");
    expect(edit.text).toBe("a \\leq b");
    expect(edit.start).toBe(edit.end);
    expect(edit.start).toBe(2 + "\\leq".length);
  });

  it("replaces a selection with a plain symbol", () => {
    expect(insertSnippet("a ? b", 2, 3, "\\neq").text).toBe("a \\neq b");
  });

  it("adds a space so a command is not glued to a following letter", () => {
    expect(insertSnippet("x", 0, 0, "\\alpha").text).toBe("\\alpha x");
    expect(insertSnippet("2", 0, 0, "\\alpha").text).toBe("\\alpha2");
  });

  it("tolerates a selection given backwards or past the end", () => {
    expect(insertSnippet("ab", 99, 99, "\\pm").text).toBe("ab\\pm");
    expect(insertSnippet("abc", 3, 1, "\\pm").text).toBe("a\\pm");
  });

  it("works on an empty equation", () => {
    const edit = insertSnippet("", 0, 0, "\\sqrt{\\square}");
    expect(edit.text.slice(edit.start, edit.end)).toBe(PLACEHOLDER);
  });
});

describe("nextPlaceholder", () => {
  const text = "\\frac{\\square}{\\square}";
  it("finds the next box after the caret, then wraps around", () => {
    const first = nextPlaceholder(text, 0)!;
    const second = nextPlaceholder(text, first.end)!;
    expect(second.start).toBeGreaterThan(first.start);
    expect(nextPlaceholder(text, second.end)).toEqual(first);
  });

  it("is null when nothing is left to fill in", () => {
    expect(nextPlaceholder("x^2", 0)).toBeNull();
    expect(box("")).toBe(PLACEHOLDER);
  });
});
