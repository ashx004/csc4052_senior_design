import { describe, expect, it } from "vitest";
import { assembleNotebookText } from "./notebookText";

describe("assembleNotebookText", () => {
  it("titles each note as a section and skips empty ones", () => {
    expect(assembleNotebookText([{ title: "Trees", text: "AVL" }, { title: "Empty", text: "  " }, { title: "Heaps", text: "min-heap" }])).toBe(
      "## Trees\n\nAVL\n\n## Heaps\n\nmin-heap"
    );
  });
  it("stops at the character limit", () => {
    const out = assembleNotebookText([{ title: "A", text: "x".repeat(40) }, { title: "B", text: "y".repeat(40) }], 60);
    expect(out.length).toBe(60);
    expect(out.startsWith("## A")).toBe(true);
  });
});
