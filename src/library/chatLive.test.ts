import { describe, expect, it } from "vitest";
import { EMPTY_ACTIVITY, MAX_LIVE_THOUGHT_CHARS, currentHeadline, headlineFromThoughts, reduceActivity } from "./chatLive";

describe("reduceActivity", () => {
  it("accumulates thoughts but keeps only the recent part", () => {
    let a = reduceActivity(EMPTY_ACTIVITY, { type: "thinking", text: "Let me look." });
    a = reduceActivity(a, { type: "thinking", text: " Then check." });
    expect(a.thoughts).toBe("Let me look. Then check.");
    a = reduceActivity(a, { type: "thinking", text: "x".repeat(MAX_LIVE_THOUGHT_CHARS + 50) });
    expect(a.thoughts).toHaveLength(MAX_LIVE_THOUGHT_CHARS);
  });

  it("tracks a tool from running to done or failed", () => {
    let a = reduceActivity(EMPTY_ACTIVITY, { type: "tool", name: "search_documents", detail: "“mitosis”" });
    expect(a.tools).toMatchObject([{ name: "search_documents", state: "running", detail: "“mitosis”" }]);
    a = reduceActivity(a, { type: "tool_done", name: "search_documents", ok: true });
    expect(a.tools[0].state).toBe("done");
    a = reduceActivity(a, { type: "tool", name: "read_document" });
    a = reduceActivity(a, { type: "tool_done", name: "read_document", ok: false });
    expect(a.tools.map((t) => t.state)).toEqual(["done", "failed"]);
  });

  it("treats a new tool as proof the previous one finished, and settle finishes the rest", () => {
    let a = reduceActivity(EMPTY_ACTIVITY, { type: "tool", name: "search_documents" });
    a = reduceActivity(a, { type: "tool", name: "read_document" });
    expect(a.tools.map((t) => t.state)).toEqual(["done", "running"]);
    a = reduceActivity(a, { type: "settle" });
    expect(a.tools.map((t) => t.state)).toEqual(["done", "done"]);
    expect(reduceActivity(a, { type: "settle" })).toBe(a);
  });

  it("ignores a tool_done with nothing running", () => {
    expect(reduceActivity(EMPTY_ACTIVITY, { type: "tool_done", name: "web_search", ok: true })).toBe(EMPTY_ACTIVITY);
  });

  it("gives every tool a distinct id and keeps a bounded list", () => {
    let a = EMPTY_ACTIVITY;
    for (let i = 0; i < 20; i++) a = reduceActivity(a, { type: "tool", name: "web_search" });
    expect(a.tools).toHaveLength(12);
    expect(new Set(a.tools.map((t) => t.id)).size).toBe(12);
  });
});

describe("headlines", () => {
  it("uses the latest complete sentence while the next one is still arriving", () => {
    expect(headlineFromThoughts("The user wants the syllabus dates. Let me search the docs. I should chec")).toBe("Let me search the docs.");
    expect(headlineFromThoughts("The user wants the syllabus dates. Let me search the docs.")).toBe("Let me search the docs.");
  });
  it("handles a single unfinished sentence, markdown and empty input", () => {
    expect(headlineFromThoughts("Looking at the **exam** schedule")).toBe("Looking at the exam schedule");
    expect(headlineFromThoughts("")).toBe("");
    expect(headlineFromThoughts("   ")).toBe("");
  });
  it("shortens long sentences", () => {
    const out = headlineFromThoughts("word ".repeat(60).trim() + ".");
    expect(out.length).toBeLessThanOrEqual(112);
    expect(out.endsWith("…")).toBe(true);
  });
  it("prefers the model's summary over the raw headline", () => {
    const a = { ...EMPTY_ACTIVITY, thoughts: "Hmm, let me think.", summary: "Checking your exam dates" };
    expect(currentHeadline(a)).toBe("Checking your exam dates");
    expect(currentHeadline({ ...a, summary: "" })).toBe("Hmm, let me think.");
  });
});
