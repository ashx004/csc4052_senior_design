import { describe, expect, it } from "vitest";
import { inlineToNodes, markdownToDoc } from "./markdownToDoc";
import { noteToMarkdown, noteToPlainText } from "./noteText";

describe("markdownToDoc", () => {
  it("round-trips the formats the editor supports", () => {
    const md = [
      "# Graph algorithms",
      "",
      "BFS uses a **queue**; DFS uses a *stack*.",
      "",
      "## Dijkstra",
      "",
      "- relax each edge",
      "- pop the closest vertex",
      "",
      "1. init distances",
      "2. repeat",
      "",
      "> Needs non-negative weights",
      "",
      "```",
      "dist[s] = 0",
      "```",
      "",
      "---",
    ].join("\n");
    expect(noteToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it("clamps headings to H3 and joins wrapped paragraph lines", () => {
    const doc = markdownToDoc("#### Deep\nline one\nline two");
    expect(doc.content[0]).toEqual({ type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Deep" }] });
    expect(noteToPlainText(doc)).toBe("Deep\n\nline one line two");
  });

  it("parses nested and mixed inline marks", () => {
    expect(inlineToNodes("a **bold _both_** and `x*y`")).toEqual([
      { type: "text", text: "a " },
      { type: "text", text: "bold ", marks: [{ type: "bold" }] },
      { type: "text", text: "both", marks: [{ type: "bold" }, { type: "italic" }] },
      { type: "text", text: " and " },
      { type: "text", text: "x*y", marks: [{ type: "code" }] },
    ]);
  });

  it("never produces an empty document", () => {
    expect(markdownToDoc("")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("round-trips dot lists, checklists, nesting, math, underline, highlight and links", () => {
    const md = [
      "* dot one",
      "* dot two",
      "",
      "- [ ] read ch. 4",
      "- [x] hand in lab",
      "",
      "- parent",
      "  - child",
      "",
      "Euler: $e^{i\\pi} + 1 = 0$ is <u>famous</u> and ==key== (see [docs](https://example.com)).",
      "",
      "$$",
      "\\int_0^1 x\\,dx",
      "$$",
    ].join("\n");
    expect(noteToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it("treats a dash as a dash list and a star as a dot list", () => {
    expect(markdownToDoc("- a").content[0].attrs).toEqual({ marker: "dash" });
    expect(markdownToDoc("* a").content[0].attrs).toEqual({ marker: "dot" });
  });

  it("does not treat dollar amounts as math", () => {
    expect(inlineToNodes("costs $5 and $6")).toEqual([{ type: "text", text: "costs $5 and $6" }]);
  });

  it("accepts LaTeX parenthesis and bracket delimiters", () => {
    expect(inlineToNodes("so \\(x^2\\) holds")[1]).toEqual({ type: "mathInline", attrs: { latex: "x^2" } });
    expect(markdownToDoc("\\[a+b\\]").content[0]).toEqual({ type: "mathBlock", attrs: { latex: "a+b" } });
  });

  it("only accepts pictures from the student's own storage and safe link targets", () => {
    expect(markdownToDoc("![x](https://evil.example/t.png)").content[0].type).toBe("paragraph");
    expect(markdownToDoc("![fig](/api/download?key=users%2Fu%2Fa.jpg)").content[0].type).toBe("noteImage");
    expect(inlineToNodes("[x](javascript:alert(1))").some((n) => "marks" in n && n.marks?.some((m) => m.type === "link"))).toBe(false);
  });

  it("keeps plain text free of markup but keeps math and picture captions", () => {
    const doc = markdownToDoc("- [ ] do $x^2$\n\n![fig](/api/download?key=a)\n\nsnake_case_name");
    expect(noteToPlainText(doc)).toBe("do x^2\n\nfig\n\nsnake_case_name");
  });
});
