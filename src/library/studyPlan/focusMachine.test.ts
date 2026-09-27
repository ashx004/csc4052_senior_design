import { describe, it, expect } from "vitest";
import {
  focusMachineReducer,
  initialFocusState,
  BREAK_SECONDS,
  type FocusMachineState,
} from "./focusMachine";

const s = (o: Partial<FocusMachineState> = {}): FocusMachineState => ({
  ...initialFocusState,
  ...o,
});

describe("focusMachineReducer", () => {
  it("starts at overlay none", () => {
    expect(initialFocusState.overlay).toBe("none");
  });

  it("COMPLETE opens the done choice", () => {
    expect(focusMachineReducer(s(), { type: "COMPLETE" }).overlay).toBe(
      "done_choice"
    );
  });

  it("CHOOSE_BREAK enters break with full countdown", () => {
    const next = focusMachineReducer(s({ overlay: "done_choice" }), {
      type: "CHOOSE_BREAK",
    });
    expect(next.overlay).toBe("break");
    expect(next.breakSecondsLeft).toBe(BREAK_SECONDS);
  });

  it("CHOOSE_FINISH clears the overlay", () => {
    expect(
      focusMachineReducer(s({ overlay: "done_choice" }), { type: "CHOOSE_FINISH" })
        .overlay
    ).toBe("none");
  });

  it("BREAK_TICK counts down and flips to back_prompt at zero", () => {
    const mid = focusMachineReducer(s({ overlay: "break", breakSecondsLeft: 2 }), {
      type: "BREAK_TICK",
    });
    expect(mid).toEqual({ overlay: "break", breakSecondsLeft: 1 });
    const end = focusMachineReducer(s({ overlay: "break", breakSecondsLeft: 1 }), {
      type: "BREAK_TICK",
    });
    expect(end.overlay).toBe("back_prompt");
  });

  it("BREAK_END jumps to back_prompt", () => {
    expect(
      focusMachineReducer(s({ overlay: "break", breakSecondsLeft: 120 }), {
        type: "BREAK_END",
      }).overlay
    ).toBe("back_prompt");
  });

  it("BACK_TO_LEARNING clears overlay", () => {
    expect(
      focusMachineReducer(s({ overlay: "back_prompt" }), { type: "BACK_TO_LEARNING" })
        .overlay
    ).toBe("none");
  });

  it("ABANDON is reachable from any overlay", () => {
    for (const overlay of ["none", "done_choice", "break"] as const) {
      expect(
        focusMachineReducer(s({ overlay }), { type: "ABANDON" }).overlay
      ).toBe("dead");
    }
  });

  it("RESET returns to initial (new session)", () => {
    expect(
      focusMachineReducer(s({ overlay: "dead", breakSecondsLeft: 4 }), {
        type: "RESET",
      })
    ).toEqual(initialFocusState);
  });

  it("BREAK_TICK is a no-op when not on break", () => {
    const st = s({ overlay: "done_choice", breakSecondsLeft: 10 });
    expect(focusMachineReducer(st, { type: "BREAK_TICK" })).toEqual(st);
  });
});
