// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";

// The real one reads the student's classes from Firebase; this test only cares about the stream.
vi.mock("@/src/library/chatContext", () => ({
  buildChatContext: async () => ({ userId: "u1", email: "u@example.com", classes: [] }),
}));

import { useAIPanelChat } from "./useAIPanelChat";

const stream = (...events: object[]) =>
  new Response(events.map((e) => JSON.stringify(e)).join("\n") + "\n", { headers: { "Content-Type": "application/x-ndjson" } });

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setup(reply: Response) {
  (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(reply);
  return renderHook(() => useAIPanelChat("u1", "u@example.com"));
}

describe("useAIPanelChat after Stop", () => {
  it("takes the question and the empty reply back out when nothing had been written, and says it was stopped", async () => {
    const { result } = setup(stream({ type: "done" }));
    // Replace the response with one that ends in a discarded stop.
    (fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      stream({ type: "thinking", text: "hmm" }, { type: "stopped", discarded: true }, { type: "done" })
    );
    let outcome: { stopped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sendMessage("Explain mitosis", null);
    });
    expect(outcome).toEqual({ stopped: true });
    expect(result.current.messages).toEqual([]);
    expect(result.current.errorText).toBeNull();
  });

  it("keeps the question and the partial reply, marked as stopped, when some of it was written", async () => {
    const { result } = setup(stream({ type: "delta", text: "Mitosis has four phases." }, { type: "stopped", discarded: false }, { type: "done" }));
    let outcome: { stopped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sendMessage("Explain mitosis", null);
    });
    expect(outcome).toEqual({ stopped: true });
    expect(result.current.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.current.messages[1].text).toBe("Mitosis has four phases.\n\n_(Stopped)_");
  });

  it("an ordinary reply is untouched", async () => {
    const { result } = setup(stream({ type: "delta", text: "Four phases." }, { type: "done" }));
    let outcome: { stopped: boolean } | undefined;
    await act(async () => {
      outcome = await result.current.sendMessage("Explain mitosis", null);
    });
    expect(outcome).toEqual({ stopped: false });
    expect(result.current.messages[1].text).toBe("Four phases.");
  });
});
