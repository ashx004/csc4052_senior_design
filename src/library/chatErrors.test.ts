import { describe, expect, it } from "vitest";
import { describeChatError } from "./chatErrors";

describe("describeChatError", () => {
  it("reports a timeout distinctly for an AbortError", () => {
    const error = new Error("The operation was aborted.");
    error.name = "AbortError";
    expect(describeChatError(error)).toBe("The assistant took too long to respond. Please try again.");
  });

  it.each([502, 503, 504])("reports an upstream-unavailable message for a %d from Ollama", (status) => {
    const error = new Error(`Ollama request failed (${status}): Bad Gateway`);
    expect(describeChatError(error)).toBe(
      "The AI assistant is temporarily unavailable — please try again in a few minutes."
    );
  });

  it("does not misclassify a non-5xx Ollama failure as upstream-unavailable", () => {
    const error = new Error("Ollama request failed (400): Bad Request");
    expect(describeChatError(error)).toBe("Couldn't reach the assistant. Please try again.");
  });

  it("falls back to the generic message for any other error", () => {
    expect(describeChatError(new Error("something else broke"))).toBe(
      "Couldn't reach the assistant. Please try again."
    );
  });

  it("falls back to the generic message for a non-Error thrown value", () => {
    expect(describeChatError("a raw string")).toBe("Couldn't reach the assistant. Please try again.");
    expect(describeChatError(null)).toBe("Couldn't reach the assistant. Please try again.");
  });
});
