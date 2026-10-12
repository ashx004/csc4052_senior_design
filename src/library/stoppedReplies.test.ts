import { describe, expect, it } from "vitest";
import { STOPPED_BEFORE_ANSWER, stoppedReplyText, withoutStopMarkers } from "./stoppedReplies";

describe("stopped replies", () => {
  it("builds the text the student sees", () => {
    expect(stoppedReplyText("Mitosis has four")).toBe("Mitosis has four\n\n_(Stopped)_");
    expect(stoppedReplyText("   ")).toBe(STOPPED_BEFORE_ANSWER);
  });

  it("rewrites markers for the model without changing how many messages there are", () => {
    const history = [
      { role: "user", content: "Explain mitosis" },
      { role: "assistant", content: stoppedReplyText("Mitosis has four") },
      { role: "user", content: "Explain meiosis" },
      { role: "assistant", content: STOPPED_BEFORE_ANSWER },
      { role: "user", content: "Explain osmosis" },
    ];
    const out = withoutStopMarkers(history);
    expect(out).toHaveLength(history.length);
    expect(out[1].content).toContain("Mitosis has four");
    expect(out[1].content).not.toContain("_(Stopped)_");
    expect(out[3].content).not.toContain("_(Stopped before");
    expect(out[0]).toBe(history[0]);
    expect(out[4]).toBe(history[4]);
  });

  it("leaves ordinary replies and a student's own message alone", () => {
    const history = [
      { role: "user", content: "what does _(Stopped)_ mean?" },
      { role: "assistant", content: "It marks a cut-short reply." },
    ];
    expect(withoutStopMarkers(history)).toEqual(history);
  });
});
