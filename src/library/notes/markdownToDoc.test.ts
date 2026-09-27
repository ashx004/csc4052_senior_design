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
});
