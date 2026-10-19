import type { KeyboardEvent } from "react";

// onKeyDown for single-line fields that sit outside a <form>: Enter runs the
// same action as the modal's primary button, unless that button is disabled.
// IME composition (e.g. typing Japanese) uses Enter to confirm text, so it's left alone.
export function submitOnEnter(submit: () => void, disabled = false) {
  return (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!disabled) submit();
  };
}
