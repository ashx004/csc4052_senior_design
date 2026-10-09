import { describe, expect, it } from "vitest";
import { nextAddIntent } from "./addIntent";

describe("nextAddIntent", () => {
  it("does not add when there is no suggestionId param", () => {
    expect(nextAddIntent(null, null)).toEqual({
      shouldAdd: false,
      handledSuggestionId: null,
    });
  });

  it("adds once for a fresh suggestionId and records it as handled", () => {
    expect(nextAddIntent("sug-1", null)).toEqual({
      shouldAdd: true,
      handledSuggestionId: "sug-1",
    });
  });

  it("does not re-add a suggestionId already handled", () => {
    expect(nextAddIntent("sug-1", "sug-1")).toEqual({
      shouldAdd: false,
      handledSuggestionId: "sug-1",
    });
  });

  it("adds again when the param changes to a different suggestion", () => {
    expect(nextAddIntent("sug-2", "sug-1")).toEqual({
      shouldAdd: true,
      handledSuggestionId: "sug-2",
    });
  });
});
