import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import { submitOnEnter } from "./submitOnEnter";

const key = (key: string, extra: Partial<{ shiftKey: boolean; isComposing: boolean }> = {}) => {
  const preventDefault = vi.fn();
  return { event: { key, shiftKey: !!extra.shiftKey, nativeEvent: { isComposing: !!extra.isComposing }, preventDefault } as unknown as KeyboardEvent<HTMLInputElement>, preventDefault };
};

describe("submitOnEnter", () => {
  it("submits on Enter", () => {
    const submit = vi.fn(), { event, preventDefault } = key("Enter");
    submitOnEnter(submit)(event);
    expect(submit).toHaveBeenCalledOnce();
    expect(preventDefault).toHaveBeenCalled();
  });
  it("ignores other keys, Shift+Enter and IME composition", () => {
    const submit = vi.fn();
    submitOnEnter(submit)(key("a").event);
    submitOnEnter(submit)(key("Enter", { shiftKey: true }).event);
    submitOnEnter(submit)(key("Enter", { isComposing: true }).event);
    expect(submit).not.toHaveBeenCalled();
  });
  it("does nothing while the action is disabled", () => {
    const submit = vi.fn();
    submitOnEnter(submit, true)(key("Enter").event);
    expect(submit).not.toHaveBeenCalled();
  });
});
