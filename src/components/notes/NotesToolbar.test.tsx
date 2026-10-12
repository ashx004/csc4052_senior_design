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

describe("NotesToolbar formatting menus", () => {
  function setupFormat(format = EMPTY_FORMAT, withSkipLine = true) {
    const actions: unknown[] = [];
    let skipped = 0;
    const { container } = render(
      <NotesToolbar
        variant="typed"
        tool={defaultToolState()}
        onToolChange={() => {}}
        format={format}
        onFormat={(a) => actions.push(a)}
        canUndo={false}
        canRedo={false}
        onUndo={() => {}}
        onRedo={() => {}}
        onSkipLine={withSkipLine ? () => void (skipped += 1) : undefined}
      />
    );
    return { actions, skipped: () => skipped, container };
  }

  it("wraps onto another row on narrow screens instead of scrolling sideways", () => {
    const { container } = setupFormat();
    const row = container.querySelector('[data-tutorial="note-toolbar"] > div') as HTMLElement;
    expect(row.className).toContain("flex-wrap");
    expect(row.className).not.toContain("overflow-x-auto");
    // Whole groups wrap, never a group's own buttons, so rows break between clusters.
    const groups = Array.from(row.children) as HTMLElement[];
    expect(groups.length).toBeGreaterThanOrEqual(4);
    for (const group of groups) expect(group.className).toContain("shrink-0");
  });

  it("keeps the toolbar to a modest number of buttons, grouping the rest into menus", () => {
    const { container } = setupFormat();
    expect(container.querySelectorAll('[data-tutorial="note-toolbar"] button').length).toBeLessThanOrEqual(22);
  });

  it("picks a heading from the heading menu, then closes it", () => {
    const { actions } = setupFormat();
    fireEvent.click(screen.getByRole("button", { name: "Heading size" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Heading 2" }));
    expect(actions).toEqual([2]);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("turns a heading back into normal text by toggling the heading that is on", () => {
    const { actions } = setupFormat({ ...EMPTY_FORMAT, heading: 3 });
    fireEvent.click(screen.getByRole("button", { name: "Heading size" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Normal text" }));
    expect(actions).toEqual([3]);
  });

  it("makes each kind of list from the list menu", () => {
    const { actions } = setupFormat();
    for (const [label, kind] of [
      [/^Dash list/, "dash"],
      [/^Bullet list/, "dot"],
      [/^Numbered list/, "ordered"],
      [/^Checklist/, "task"],
    ] as const) {
      fireEvent.click(screen.getByRole("button", { name: "Lists" }));
      fireEvent.click(screen.getByRole("menuitem", { name: label }));
      expect(actions.at(-1)).toEqual({ list: kind });
    }
  });

  it("reaches the less-used tools from the More menu, including blank line when offered", () => {
    const { actions, skipped } = setupFormat();
    fireEvent.click(screen.getByRole("button", { name: /^More/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Strikethrough" }));
    fireEvent.click(screen.getByRole("button", { name: /^More/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Insert picture" }));
    fireEvent.click(screen.getByRole("button", { name: /^More/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Add blank line" }));
    expect(actions).toEqual(["strike", "image"]);
    expect(skipped()).toBe(1);
  });

  it("leaves blank line out of the More menu when there is no handler for it", () => {
    setupFormat(EMPTY_FORMAT, false);
    fireEvent.click(screen.getByRole("button", { name: /^More/ }));
    expect(screen.queryByRole("menuitem", { name: "Add blank line" })).toBeNull();
  });
});
