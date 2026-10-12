import { describe, expect, it } from "vitest";
import { mergeSharedEdit, plainTextDocument } from "./sharedEdit";
import { noteToPlainText } from "./noteText";

const text = (value: string, marks?: object[]) => ({ type: "text", text: value, ...(marks ? { marks } : {}) });
const doc = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [text("Key ideas")] },
    { type: "paragraph", content: [text("ACID "), text("matters", [{ type: "bold" }])] },
    { type: "image", attrs: { src: "https://example.test/a.png", alt: "" } },
    { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [text("one")] }] }] },
    { type: "paragraph", content: [text("last")] },
  ],
};
const plain = noteToPlainText(doc);

describe("mergeSharedEdit", () => {
  it("returns the same document when nothing changed", () => {
    expect(mergeSharedEdit(doc, plain)).toEqual(doc);
  });

  it("keeps formatting on untouched blocks and retypes an edited one", () => {
    const edited = plain.replace("ACID matters", "ACID really matters");
    const merged = mergeSharedEdit(doc, edited);
    expect(merged.content[0]).toEqual(doc.content[0]);
    expect(merged.content[1]).toEqual({ type: "paragraph", content: [text("ACID really matters")] });
    expect(merged.content[2]).toEqual(doc.content[2]);
    expect(merged.content[3]).toEqual(doc.content[3]);
    expect(noteToPlainText(merged)).toBe(edited);
  });

  it("an edited heading stays a heading of the same level", () => {
    const merged = mergeSharedEdit(doc, plain.replace("Key ideas", "Main ideas"));
    expect(merged.content[0]).toEqual({ type: "heading", attrs: { level: 1 }, content: [text("Main ideas")] });
  });

  it("adds new paragraphs and drops deleted ones", () => {
    const added = mergeSharedEdit(doc, `${plain}\n\nbrand new`);
    expect(added.content.at(-1)).toEqual({ type: "paragraph", content: [text("brand new")] });
    expect(added.content.slice(0, 5)).toEqual(doc.content);

    const removed = mergeSharedEdit(doc, plain.replace("\n\nlast", ""));
    expect(noteToPlainText(removed)).toBe(plain.replace("\n\nlast", ""));
    expect(removed.content).toContainEqual(doc.content[3]);
  });

  it("falls back to plain paragraphs without an existing document", () => {
    expect(mergeSharedEdit(null, "a\nb")).toEqual(plainTextDocument("a\nb"));
    expect(mergeSharedEdit({ type: "doc", content: [] }, "hello").content).toHaveLength(1);
  });

  it("editing a list item keeps the list, its type and checked state", () => {
    const task = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            { type: "taskItem", attrs: { checked: true }, content: [{ type: "paragraph", content: [text("read ch 1")] }] },
            { type: "taskItem", attrs: { checked: false }, content: [{ type: "paragraph", content: [text("read ch 2")] }] },
          ],
        },
      ],
    };
    const merged = mergeSharedEdit(task, "read ch 1\nread chapter 2\nread ch 3");
    const list = merged.content[0];
    expect(list.type).toBe("taskList");
    expect(list.content).toHaveLength(3);
    expect(list.content![0].attrs).toEqual({ checked: true });
    expect(list.content![1].content![0].content![0].text).toBe("read chapter 2");
    expect(list.content![2].attrs).toEqual({ checked: false });
  });

  it("a list edited in a mixed document leaves the other blocks alone", () => {
    const edited = plain.replace("one", "uno");
    const merged = mergeSharedEdit(doc, edited);
    expect(merged.content[3].type).toBe("bulletList");
    expect(merged.content[3].content![0].content![0].content![0].text).toBe("uno");
    expect(merged.content[0]).toEqual(doc.content[0]);
    expect(merged.content[2]).toEqual(doc.content[2]);
  });

  describe("code and math blocks with blank lines", () => {
    const code = "def f():\n    a = 1\n\n    return a";
    const withCode = {
      type: "doc",
      content: [
        { type: "paragraph", content: [text("intro")] },
        { type: "codeBlock", attrs: { language: "python" }, content: [text(code)] },
        { type: "paragraph", content: [text("outro")] },
      ],
    };
    const codePlain = noteToPlainText(withCode);

    it("keeps an unchanged code block that contains a blank line", () => {
      expect(mergeSharedEdit(withCode, codePlain)).toEqual(withCode);
    });

    it("keeps an edited code block as one code block, blank line and indentation intact", () => {
      const edited = codePlain.replace("a = 1", "a = 2");
      const merged = mergeSharedEdit(withCode, edited);
      expect(merged.content).toHaveLength(3);
      expect(merged.content[1]).toEqual({ type: "codeBlock", attrs: { language: "python" }, content: [text("def f():\n    a = 2\n\n    return a")] });
      expect(merged.content[2]).toEqual(withCode.content[2]);
      expect(noteToPlainText(merged)).toBe(edited);
    });

    it("keeps an edit to the lines after the blank line", () => {
      const merged = mergeSharedEdit(withCode, codePlain.replace("return a", "return a + 1"));
      expect(merged.content[1].type).toBe("codeBlock");
      expect(merged.content).toHaveLength(3);
    });

    it("keeps a single-line code block as code when it is edited", () => {
      const one = { type: "doc", content: [{ type: "codeBlock", content: [text("x = 1")] }, { type: "paragraph", content: [text("after")] }] };
      const merged = mergeSharedEdit(one, "x = 2\n\nafter");
      expect(merged.content[0]).toEqual({ type: "codeBlock", content: [text("x = 2")] });
    });

    it("keeps an edited math block as a math block", () => {
      const math = { type: "doc", content: [{ type: "mathBlock", attrs: { latex: "a+b" } }, { type: "paragraph", content: [text("after")] }] };
      const merged = mergeSharedEdit(math, "a+c\n\nafter");
      expect(merged.content[0]).toEqual({ type: "mathBlock", attrs: { latex: "a+c" } });
    });
  });
});
