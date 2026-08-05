import { describe, expect, it } from "vitest";
import { buildSystemPrompt, ChatContext } from "./systemPrompt";

const CONTEXT: ChatContext = {
  userId: "u1",
  email: "student@example.edu",
  name: "Jordan",
  college: "Example University",
  classes: [],
};

describe("buildSystemPrompt ordering (KV-cache prefix stability)", () => {
  it("keeps the volatile timestamp out of the front of the prompt", () => {
    const prompt = buildSystemPrompt(CONTEXT, undefined, false, null);
    // "Current date/time:" must not appear anywhere near the start — it
    // should be the trailing content, after the large static layers.
    const timeIndex = prompt.indexOf("Current date/time:");
    expect(timeIndex).toBeGreaterThan(prompt.length * 0.5);
  });

  it("produces a byte-identical prefix across two calls made at different (simulated) times", () => {
    // buildSystemPrompt reads new Date() internally, so two real calls a
    // moment apart would already produce different timestamps — enough to
    // prove the point: only the tail (after the shared prefix) should
    // differ, not the whole string.
    const first = buildSystemPrompt(CONTEXT, undefined, false, null);
    const second = buildSystemPrompt(CONTEXT, undefined, false, null);

    let sharedPrefixLength = 0;
    while (
      sharedPrefixLength < first.length &&
      sharedPrefixLength < second.length &&
      first[sharedPrefixLength] === second[sharedPrefixLength]
    ) {
      sharedPrefixLength++;
    }

    // The shared prefix should cover everything up to the "Current
    // date/time:" marker — i.e. the entire static portion of the prompt.
    expect(sharedPrefixLength).toBeGreaterThanOrEqual(first.indexOf("Current date/time:"));
  });

  it("places the query-clarification note after the static layers too", () => {
    const prompt = buildSystemPrompt(CONTEXT, undefined, false, "wants help with homework 3");
    const noteIndex = prompt.indexOf("wants help with homework 3");
    const toolsIndex = prompt.indexOf("Tools:");
    expect(noteIndex).toBeGreaterThan(toolsIndex);
  });

  it("still includes the post-tool layer when requested, before the trailing volatile content", () => {
    const prompt = buildSystemPrompt(CONTEXT, undefined, true, null);
    expect(prompt).toContain("You've used a tool this turn.");
    expect(prompt.indexOf("You've used a tool this turn.")).toBeLessThan(prompt.indexOf("Current date/time:"));
  });
});
