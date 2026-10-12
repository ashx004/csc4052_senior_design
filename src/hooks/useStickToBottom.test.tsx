// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useStickToBottom } from "./useStickToBottom";

afterEach(cleanup);

function Chat({ lines, onReady }: { lines: number; onReady?: (stick: () => void) => void }) {
  const { attach, onScroll, stick } = useStickToBottom<HTMLDivElement>([lines]);
  onReady?.(stick);
  return <div data-testid="scroller" ref={attach} onScroll={onScroll} />;
}

/** jsdom doesn't lay anything out, so say how tall the chat is. */
function sizeIt(el: HTMLElement, scrollHeight: number, clientHeight = 100) {
  Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
  Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
}

describe("useStickToBottom", () => {
  it("follows new content while the reader is at the bottom", () => {
    const { rerender } = render(<Chat lines={1} />);
    const el = screen.getByTestId("scroller");
    sizeIt(el, 1000);
    rerender(<Chat lines={2} />);
    expect(el.scrollTop).toBe(1000);
  });

  it("stays put once the reader has scrolled up, and follows again when they return to the bottom", () => {
    const { rerender } = render(<Chat lines={1} />);
    const el = screen.getByTestId("scroller");
    sizeIt(el, 1000);

    el.scrollTop = 0; // scrolled well away from the bottom
    fireEvent.scroll(el);
    rerender(<Chat lines={2} />);
    expect(el.scrollTop).toBe(0);

    el.scrollTop = 900; // back at the bottom (1000 - 900 - 100 = 0 from the end)
    fireEvent.scroll(el);
    sizeIt(el, 1200);
    rerender(<Chat lines={3} />);
    expect(el.scrollTop).toBe(1200);
  });

  it("stick() jumps to the bottom and resumes following (after the student sends a message)", () => {
    let stick = () => {};
    const { rerender } = render(<Chat lines={1} onReady={(s) => (stick = s)} />);
    const el = screen.getByTestId("scroller");
    sizeIt(el, 1000);
    el.scrollTop = 0;
    fireEvent.scroll(el);
    stick();
    expect(el.scrollTop).toBe(1000);
    sizeIt(el, 1400);
    rerender(<Chat lines={2} onReady={(s) => (stick = s)} />);
    expect(el.scrollTop).toBe(1400);
  });
});
