import { describe, expect, it } from "vitest";
import { getEffectiveModelKey } from "./chatMode";

// The per-task/unified model-selection system (5 possible models, stored
// preferences, "reduce cold boots") was removed 2026-09-21 when the app
// unified onto a single main model (Muse Glimmer). getEffectiveModelKey is
// kept only so existing call sites (chat/quiz/flashcards request bodies)
// don't need to change - it now always returns the same key.
describe("getEffectiveModelKey", () => {
  it("always returns museGlimmer, regardless of task", () => {
    expect(getEffectiveModelKey("chat")).toBe("museGlimmer");
    expect(getEffectiveModelKey("quiz")).toBe("museGlimmer");
    expect(getEffectiveModelKey("flashcards")).toBe("museGlimmer");
  });
});
