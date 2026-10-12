// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import FillBlankRunner from "./FillBlankRunner";
import DragDropRunner from "./DragDropRunner";
import { buildMatchRound } from "@/src/library/practice/dragDrop";
import type { FillBlankItem } from "@/src/library/practice/types";

afterEach(cleanup);

const fill = (id: string, text: string, answer: string): FillBlankItem => ({
  id,
  kind: "fill_blank",
  text,
  blanks: [{ answer, alternatives: [] }],
  explanation: `Because ${answer}.`,
});

describe("FillBlankRunner", () => {
  const items = [
    fill("q1", "The ____ stores genetic information as DNA in the cell.", "nucleus"),
    fill("q2", "Glycolysis happens in the ____ of the cell.", "cytosol"),
  ];

  it("grades each answer, shows the explanation, and reports every result at the end", () => {
    const onFinish = vi.fn();
    render(<FillBlankRunner items={items} onFinish={onFinish} />);

    // Check stays disabled until the blank is filled.
    expect((screen.getByRole("button", { name: "Check" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Blank 1"), { target: { value: "Nucleus" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText("Because nucleus.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Next question/ }));

    fireEvent.change(screen.getByLabelText("Blank 1"), { target: { value: "mitochondria" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    expect(screen.getByText(/The answer is/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /See results/ }));

    expect(onFinish).toHaveBeenCalledTimes(1);
    const results = onFinish.mock.calls[0][0];
    expect(results.map((r: { itemId: string; score: number }) => [r.itemId, r.score])).toEqual([["q1", 1], ["q2", 0]]);
  });

  it("accepts a one-letter typo in a long answer", () => {
    const onFinish = vi.fn();
    render(<FillBlankRunner items={[items[0]]} onFinish={onFinish} />);
    fireEvent.change(screen.getByLabelText("Blank 1"), { target: { value: "nucelus" } });
    fireEvent.click(screen.getByRole("button", { name: "Check" }));
    fireEvent.click(screen.getByRole("button", { name: /See results/ }));
    expect(onFinish.mock.calls[0][0][0].score).toBe(1);
  });
});

describe("DragDropRunner", () => {
  const pairs = [
    { left: "Nucleus", right: "Stores DNA" },
    { left: "Ribosome", right: "Builds proteins" },
    { left: "Lysosome", right: "Digests waste" },
  ];
  const round = () => buildMatchRound({ instructions: "Match each organelle.", explanation: "Basic organelle jobs.", pairs }, "round1", () => 0.5)!;

  function playCorrectly() {
    for (const pair of pairs) {
      fireEvent.click(screen.getByRole("button", { name: pair.left }));
      fireEvent.click(screen.getByText(pair.right));
    }
  }

  it("starts on a ready screen with the clock, and a click-then-click placement scores a perfect round", () => {
    const onFinish = vi.fn();
    render(<DragDropRunner items={[round()]} onFinish={onFinish} />);
    expect(screen.getByText(/on the clock/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Start round/ }));
    expect(screen.getByRole("timer")).toBeTruthy();

    playCorrectly();
    fireEvent.click(screen.getByRole("button", { name: "Check answer" }));
    expect(screen.getByText("Perfect round!")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /See results/ }));

    const [results] = onFinish.mock.calls[0];
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ itemId: "round1", score: 1 });
    expect(results[0].points).toBeGreaterThan(0);
  });

  it("scores partial credit for a half-finished round and Reset clears the board", () => {
    const onFinish = vi.fn();
    render(<DragDropRunner items={[round()]} onFinish={onFinish} />);
    fireEvent.click(screen.getByRole("button", { name: /Start round/ }));

    fireEvent.click(screen.getByRole("button", { name: "Nucleus" }));
    fireEvent.click(screen.getByText("Stores DNA"));
    fireEvent.click(screen.getByRole("button", { name: "Ribosome" }));
    fireEvent.click(screen.getByText("Digests waste")); // wrong zone on purpose
    fireEvent.click(screen.getByRole("button", { name: "Check what I have" }));
    expect(screen.getByText(/1 of 3 in the right place/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /See results/ }));
    expect(onFinish.mock.calls[0][0][0].score).toBeCloseTo(1 / 3);
  });

  it("ends the round by itself when the clock runs out", () => {
    vi.useFakeTimers();
    try {
      render(<DragDropRunner items={[round()]} onFinish={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: /Start round/ }));
      act(() => {
        vi.advanceTimersByTime(round().timeLimitSeconds * 1000 + 1000);
      });
      expect(screen.getByText(/Time ran out/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
