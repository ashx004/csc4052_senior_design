// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { getStoredSearchBarEnabled, setStoredSearchBarEnabled } from "./searchBarPreference";

describe("searchBarPreference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to enabled", () => {
    expect(getStoredSearchBarEnabled()).toBe(true);
  });

  it("remembers being turned off and back on", () => {
    setStoredSearchBarEnabled(false);
    expect(getStoredSearchBarEnabled()).toBe(false);
    setStoredSearchBarEnabled(true);
    expect(getStoredSearchBarEnabled()).toBe(true);
  });
});
