// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { TabIndent, indentMore, outdentOnEmptyBackspace } from "./basicExtensions";

let editor: Editor | null = null;

function make(content: object) {
  editor = new Editor({ element: document.createElement("div"), extensions: [StarterKit, TabIndent], content });
  return editor;
}

afterEach(() => {
  editor?.destroy();
  editor = null;
});

const para = (text?: string, indent = 0) => ({ type: "paragraph", attrs: { indent }, ...(text ? { content: [{ type: "text", text }] } : {}) });
const item = (text?: string, nested?: object) => ({
  type: "listItem",
  content: [{ type: "paragraph", ...(text ? { content: [{ type: "text", text }] } : {}) }, ...(nested ? [nested] : [])],
});
const bullets = (...items: object[]) => ({ type: "bulletList", content: items });

describe("Backspace on a line with no text", () => {
  it("removes one level of indent from an empty indented line", () => {
    const ed = make({ type: "doc", content: [para("above"), para(undefined, 2)] });
    ed.commands.focus("end");
    expect(outdentOnEmptyBackspace(ed)).toBe(true);
    expect(ed.state.doc.lastChild?.attrs.indent).toBe(1);
  });

  it("leaves an empty line with no indent to the normal Backspace", () => {
    const ed = make({ type: "doc", content: [para("above"), para()] });
    ed.commands.focus("end");
    expect(outdentOnEmptyBackspace(ed)).toBe(false);
    expect(ed.state.doc.childCount).toBe(2);
  });

  it("does nothing special when the line has text", () => {
    const ed = make({ type: "doc", content: [para("hello", 2)] });
    ed.commands.focus("end");
    expect(outdentOnEmptyBackspace(ed)).toBe(false);
    expect(ed.state.doc.firstChild?.attrs.indent).toBe(2);
  });

  it("un-nests an empty nested list item, like Shift+Tab", () => {
    const ed = make({ type: "doc", content: [bullets(item("parent", bullets(item())))] });
    ed.commands.focus("end");
    expect(outdentOnEmptyBackspace(ed)).toBe(true);
    const list = ed.state.doc.firstChild!;
    // Both items are now at the top level of the one list.
    expect(list.childCount).toBe(2);
    expect(list.child(0).childCount).toBe(1);
  });

  it("takes an empty top-level list item out of the list", () => {
    const ed = make({ type: "doc", content: [bullets(item("one"), item())] });
    ed.commands.focus("end");
    expect(outdentOnEmptyBackspace(ed)).toBe(true);
    expect(ed.state.doc.lastChild?.type.name).toBe("paragraph");
  });

  it("matches what Tab then Backspace should undo", () => {
    const ed = make({ type: "doc", content: [para("x"), para()] });
    ed.commands.focus("end");
    indentMore(ed);
    expect(ed.state.doc.lastChild?.attrs.indent).toBe(1);
    outdentOnEmptyBackspace(ed);
    expect(ed.state.doc.lastChild?.attrs.indent).toBe(0);
  });
});
