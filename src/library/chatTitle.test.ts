import { describe, expect, it } from "vitest";
import { deriveChatTitle } from "./chatTitle";

describe("deriveChatTitle", () => {
  it("returns short messages unchanged, whitespace-collapsed", () => {
    expect(deriveChatTitle("  hello   world  ")).toBe("hello world");
  });

  it("does not truncate a message exactly 48 characters long", () => {
    const msg = "a".repeat(48);
    expect(deriveChatTitle(msg)).toBe(msg);
  });

  it("truncates at the last word boundary past position 20 and appends an ellipsis", () => {
    const msg = "This is a fairly long chat message that should get truncated at a word boundary";
    const result = deriveChatTitle(msg);
    expect(result.endsWith("…")).toBe(true);
    expect(result.length).toBeLessThanOrEqual(49); // 48 + ellipsis
    expect(result.slice(0, -1).endsWith(" ")).toBe(false); // no trailing space before the ellipsis
  });

  it("hard-truncates at 48 chars when no word boundary exists past position 20", () => {
    const msg = "a".repeat(100);
    const result = deriveChatTitle(msg);
    expect(result).toBe("a".repeat(48) + "…");
  });
});
