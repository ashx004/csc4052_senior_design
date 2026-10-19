import { describe, expect, it } from "vitest";
import { createGuardedThoughtRelay, createThoughtRelay } from "./thoughtRelay";
import { OutputGuard } from "./outputGuard";

function setup(overrides: Partial<Parameters<typeof createThoughtRelay>[0]> = {}) {
  const sent: { type: string; text: string }[] = [];
  let clock = 0;
  const relay = createThoughtRelay({ send: (e) => sent.push(e), now: () => clock, ...overrides });
  return { sent, relay, tick: (ms: number) => (clock += ms) };
}

describe("createThoughtRelay", () => {
  it("writes at most two summaries per turn, however long the reasoning", async () => {
    let calls = 0;
    const { relay, tick } = setup({ summarize: async () => `line ${++calls}`, summaryMinNewChars: 10, summaryMinIntervalMs: 100 });
    for (let i = 0; i < 10; i++) {
      relay.push("x".repeat(50));
      tick(200);
      await Promise.resolve();
    }
    expect(calls).toBe(2);
  });

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

describe("createGuardedThoughtRelay", () => {
  const ID = "k3j9Qx7LmN2pR8vT4wZa";
  function guarded() {
    const sent: { type: string; text: string }[] = [];
    const guard = new OutputGuard({ urls: [], emails: [], ids: new Map([[ID, "your class"]]) });
    const relay = createGuardedThoughtRelay({ send: (e) => sent.push(e), flushChars: 1 }, guard);
    return { sent, relay };
  }
  const shown = (sent: { type: string; text: string }[]) => sent.filter((e) => e.type === "thinking").map((e) => e.text).join("");

  it("hides an internal ID even when it arrives split across pieces", () => {
    const { sent, relay } = guarded();
    relay.push(`The class has the id ${ID.slice(0, 9)}`);
    relay.push(`${ID.slice(9)} so I should look at it.`);
    relay.end();
    expect(shown(sent)).not.toContain(ID);
    expect(shown(sent)).not.toContain(ID.slice(0, 9));
  });

  it("swaps tool function names for plain words and drops unverified links and emails", () => {
    const { sent, relay } = guarded();
    relay.push("I will call get_course_details, then cite https://made-up.example/page and mail fake@somewhere.io now.");
    relay.end();
    const text = shown(sent);
    expect(text).not.toContain("get_course_details");
    expect(text).not.toContain("made-up.example");
    expect(text).not.toContain("fake@somewhere.io");
  });

  it("still delivers ordinary reasoning in full once flushed", () => {
    const { sent, relay } = guarded();
    relay.push("Comparing the two midterm dates to see which comes first.");
    relay.flush();
    expect(shown(sent)).toBe("Comparing the two midterm dates to see which comes first.");
  });

  it("cleans summaries too", () => {
    const sent: { type: string; text: string }[] = [];
    const guard = new OutputGuard({ urls: [], emails: [], ids: new Map([[ID, "your class"]]) });
    const relay = createGuardedThoughtRelay(
      { send: (e) => sent.push(e), summarize: async () => `Opening ${ID} now`, summaryMinNewChars: 1, summaryMinIntervalMs: 0 },
      guard
    );
    relay.push("x");
    return new Promise<void>((resolve) =>
      setTimeout(() => {
        const summary = sent.find((e) => e.type === "thought_summary");
        expect(summary?.text).toBe("Opening your class now");
        relay.end();
        resolve();
      }, 10)
    );
  });
});
