// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import NotesToolbar, { EMPTY_FORMAT } from "./NotesToolbar";
import { defaultToolState, type ToolState } from "./tools";

afterEach(cleanup);

function Harness({ onMode }: { onMode: (mode: ToolState["mode"]) => void }) {
  const [tool, setTool] = useState<ToolState>(defaultToolState);
  onMode(tool.mode);
  return (
    <NotesToolbar
      variant="typed"
      tool={tool}
      onToolChange={setTool}
      format={EMPTY_FORMAT}
      onFormat={() => {}}
      canUndo={false}
      canRedo={false}
      onUndo={() => {}}
      onRedo={() => {}}
    />
  );
}

function setup() {
  const seen: ToolState["mode"][] = [];
  render(<Harness onMode={(mode) => seen.push(mode)} />);
  return { current: () => seen[seen.length - 1] };
}

const button = (name: RegExp) => screen.getByRole("button", { name });

describe("NotesToolbar tool buttons", () => {
  it.each([
    ["pencil", /^Pencil/],
    ["highlighter", /^Highlighter/],
    ["eraser", /^Eraser/],
    ["text", /^Text box/],
    ["sticker", /^Stickers/],
  ] as const)("selects %s, and clicking it again goes back to typing", (mode, name) => {
    const state = setup();
    expect(state.current()).toBe("type");
    fireEvent.click(button(name));
    expect(state.current()).toBe(mode);
    fireEvent.click(button(name));
    expect(state.current()).toBe("type");
  });

  it("opens the pen's color and size panel on the first click and closes it on the second", () => {
    setup();
    fireEvent.click(button(/^Pencil/));
    expect(screen.getByRole("button", { name: /pen$/i, pressed: true })).toBeTruthy();
    fireEvent.click(button(/^Pencil/));
    expect(screen.queryAllByRole("button", { name: /pen$/i }).length).toBe(0);
  });

  it("switching straight from one tool to another does not pass through typing", () => {
    const state = setup();
    fireEvent.click(button(/^Pencil/));
    fireEvent.click(button(/^Eraser/));
    expect(state.current()).toBe("eraser");
  });
});
