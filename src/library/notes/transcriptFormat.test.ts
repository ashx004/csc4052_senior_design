import { describe, expect, it } from "vitest";
import { preserveLineBreaks, wordCount } from "./transcriptFormat";

describe("preserveLineBreaks", () => {
  it("turns soft line breaks in prose into hard breaks", () => {
    expect(preserveLineBreaks("line one\nline two\n\nnext")).toBe("line one  \nline two\n\nnext");
  });
  it("leaves lists, headings, tables and code fences alone", () => {
    const md = "# Title\n- a\n- b\n\n| x | y |\n|---|---|\n| 1 | 2 |\n\n```\ncode\nmore\n```";
    expect(preserveLineBreaks(md)).toBe(md);
  });
  it("handles Windows newlines and a single line", () => {
    expect(preserveLineBreaks("a\r\nb")).toBe("a  \nb");
    expect(preserveLineBreaks("only")).toBe("only");
  });
});

describe("wordCount", () => {
  it("counts words", () => {
    expect(wordCount("")).toBe(0);
    expect(wordCount("  two  words\nhere ")).toBe(3);
  });
});
