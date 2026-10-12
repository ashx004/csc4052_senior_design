// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { MathInline } from "./MathExtension";

afterEach(cleanup);

let lastEditor: Editor | null = null;

function Harness({ latex = "" }: { latex?: string }) {
  const editor = useEditor({
    immediatelyRender: true,
    extensions: [StarterKit, MathInline],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "mathInline", attrs: { latex } }] }] },
  });
  lastEditor = editor ?? null;
  return <EditorContent editor={editor} />;
}

const box = () => screen.getByLabelText("LaTeX equation") as HTMLTextAreaElement;
/** TipTap draws a node view just after mounting, so wait for the editing box. */
const ready = () => screen.findByLabelText("LaTeX equation");

describe("equation editor with the button builder", () => {
  it("opens with the palette beside the LaTeX box when an equation is empty", async () => {
    render(<Harness />);
    await ready();
    expect(box().value).toBe("");
    expect(screen.getByRole("tablist", { name: "Equation parts" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fraction" })).toBeTruthy();
  });

  it("writes the LaTeX for a clicked template, and keeps the equation open for more", async () => {
    render(<Harness />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Fraction" }));
    expect(box().value).toBe("\\frac{\\square}{\\square}");
    // Still editing: the click didn't finish or delete the equation.
    expect(screen.getByLabelText("LaTeX equation")).toBeTruthy();
  });

  it("switches groups and inserts a Greek letter next to what is already there", async () => {
    render(<Harness />);
    await ready();
    fireEvent.change(box(), { target: { value: "2" } });
    box().setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole("tab", { name: "Greek" }));
    fireEvent.click(screen.getByRole("button", { name: "pi" }));
    expect(box().value).toBe("2\\pi");
  });

  it("does not take focus away from the text box when a button is pressed", async () => {
    render(<Harness />);
    await ready();
    const pressed = fireEvent.mouseDown(screen.getByRole("button", { name: "Fraction" }));
    // fireEvent returns false when the event's default was prevented.
    expect(pressed).toBe(false);
  });

  it("Tab jumps to the next empty box in a template", async () => {
    render(<Harness />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Fraction" }));
    const field = box();
    field.setSelectionRange(0, 0);
    fireEvent.keyDown(field, { key: "Tab" });
    expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe("\\square");
    const first = field.selectionStart;
    fireEvent.keyDown(field, { key: "Tab" });
    expect(field.selectionStart).toBeGreaterThan(first);
  });

  it("finishes with the Done button and saves what was built", async () => {
    render(<Harness />);
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Square root" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByLabelText("LaTeX equation")).toBeNull();
    expect((lastEditor?.getJSON().content?.[0].content?.[0] as { attrs?: { latex?: string } } | undefined)?.attrs?.latex).toBe("\\sqrt{\\square}");
  });

  it("opens an existing equation for editing with the same buttons", async () => {
    render(<Harness latex="x^2" />);
    expect(screen.queryByLabelText("LaTeX equation")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: /Equation x\^2/ }));
    expect(box().value).toBe("x^2");
    expect(screen.getByRole("button", { name: "Fraction" })).toBeTruthy();
  });
});
