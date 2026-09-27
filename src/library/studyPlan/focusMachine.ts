export type OverlayPhase =
  | "none"
  | "done_choice"
  | "break"
  | "back_prompt"
  | "dead";

export interface FocusMachineState {
  overlay: OverlayPhase;
  breakSecondsLeft: number;
}

export type FocusAction =
  | { type: "COMPLETE" } // reached 100% OR user pressed Done
  | { type: "CHOOSE_BREAK" }
  | { type: "CHOOSE_FINISH" }
  | { type: "BREAK_TICK" }
  | { type: "BREAK_END" }
  | { type: "BACK_TO_LEARNING" }
  | { type: "ABANDON" }
  | { type: "RESET" };

export const BREAK_SECONDS = 300;

export const initialFocusState: FocusMachineState = {
  overlay: "none",
  breakSecondsLeft: BREAK_SECONDS,
};

export function focusMachineReducer(
  state: FocusMachineState,
  action: FocusAction
): FocusMachineState {
  switch (action.type) {
    case "COMPLETE":
      return { ...state, overlay: "done_choice" };
    case "CHOOSE_BREAK":
      return { overlay: "break", breakSecondsLeft: BREAK_SECONDS };
    case "CHOOSE_FINISH":
      return { ...state, overlay: "none" };
    case "BREAK_TICK": {
      if (state.overlay !== "break") return state;
      if (state.breakSecondsLeft <= 1)
        return { ...state, overlay: "back_prompt", breakSecondsLeft: 0 };
      return { ...state, breakSecondsLeft: state.breakSecondsLeft - 1 };
    }
    case "BREAK_END":
      return { ...state, overlay: "back_prompt" };
    case "BACK_TO_LEARNING":
      return { ...state, overlay: "none" };
    case "ABANDON":
      return { ...state, overlay: "dead" };
    case "RESET":
      return { ...initialFocusState };
    default:
      return state;
  }
}
