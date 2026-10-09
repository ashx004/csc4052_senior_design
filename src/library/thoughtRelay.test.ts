import { describe, expect, it } from "vitest";
import { createThoughtRelay } from "./thoughtRelay";

function setup(overrides: Partial<Parameters<typeof createThoughtRelay>[0]> = {}) {
  const sent: { type: string; text: string }[] = [];
  let clock = 0;
  const relay = createThoughtRelay({ send: (e) => sent.push(e), now: () => clock, ...overrides });
  return { sent, relay, tick: (ms: number) => (clock += ms) };
}

describe("createThoughtRelay", () => {
  it("batches small pieces until enough text or time has built up", () => {
    const { sent, relay, tick } = setup({ flushChars: 10, flushMs: 100 });
    relay.push("abc");
    expect(sent).toEqual([]);
    relay.push("defghijk"); // now 11 chars
    expect(sent).toEqual([{ type: "thinking", text: "abcdefghijk" }]);
    relay.push("x");
    tick(150);
    relay.push("y"); // enough time passed
    expect(sent.at(-1)).toEqual({ type: "thinking", text: "xy" });
  });

  it("flush() sends what is waiting and end() stops everything", () => {
    const { sent, relay } = setup({ flushChars: 1000 });
    relay.push("hello");
    expect(sent).toEqual([]);
    relay.flush();
    expect(sent).toEqual([{ type: "thinking", text: "hello" }]);
    relay.push("tail");
    relay.end();
    expect(sent.at(-1)).toEqual({ type: "thinking", text: "tail" });
    relay.push("ignored");
    relay.end();
    expect(sent).toHaveLength(2);
  });

  it("caps how much reasoning is forwarded per turn", () => {
    const { sent, relay } = setup({ maxChars: 10, flushChars: 1 });
    relay.push("12345678");
    relay.push("abcdefgh");
    relay.push("more");
    relay.end();
    expect(sent.map((e) => e.text).join("")).toBe("12345678ab");
  });

  it("asks the summarizer only when there is enough new text, enough time, and none in flight", async () => {
    const calls: string[] = [];
    let resolve!: (line: string | null) => void;
    const { sent, relay, tick } = setup({
      flushChars: 5,
      summaryMinNewChars: 20,
      summaryMinIntervalMs: 1000,
      summarize: (recent) => {
        calls.push(recent);
        return new Promise((r) => (resolve = r));
      },
    });
    relay.push("short");
    expect(calls).toHaveLength(0); // not enough new text
    tick(2000);
    relay.push("a longer stretch of reasoning text");
    expect(calls).toHaveLength(1);
    relay.push("even more reasoning text arrives while waiting");
    tick(2000);
    relay.push("and more");
    expect(calls).toHaveLength(1); // still in flight
    resolve("  Comparing the options  ");
    await Promise.resolve();
    await Promise.resolve();
    expect(sent.filter((e) => e.type === "thought_summary")).toEqual([{ type: "thought_summary", text: "Comparing the options" }]);
  });

  it("gives the summarizer only the recent part of the reasoning", () => {
    const calls: string[] = [];
    const { relay } = setup({ flushChars: 1, summaryMinNewChars: 1, summaryWindowChars: 10, summarize: async (r) => (calls.push(r), null) });
    relay.push("0123456789ABCDEFGHIJ");
    expect(calls[0]).toBe("ABCDEFGHIJ");
  });

  it("survives a failing summarizer and drops summaries that arrive after the turn ended", async () => {
    const failing = setup({ summaryMinNewChars: 1, summarize: () => Promise.reject(new Error("down")) });
    failing.relay.push("text");
    await Promise.resolve();
    failing.relay.push("more text");
    expect(failing.sent.some((e) => e.type === "thought_summary")).toBe(false);

    let resolve!: (line: string | null) => void;
    const late = setup({ summaryMinNewChars: 1, summarize: () => new Promise((r) => (resolve = r)) });
    late.relay.push("text");
    late.relay.end();
    resolve("too late");
    await Promise.resolve();
    await Promise.resolve();
    expect(late.sent.some((e) => e.type === "thought_summary")).toBe(false);
  });
});
