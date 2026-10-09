import { describe, expect, it } from "vitest";
import { registerChatRun, releaseChatRun, stopChatRun } from "./chatRuns";

describe("chat runs", () => {
  it("aborts the signal of the run that is stopped", () => {
    const controller = registerChatRun("user-a", "run-12345678");
    expect(controller.signal.aborted).toBe(false);
    expect(stopChatRun("user-a", "run-12345678")).toBe(true);
    expect(controller.signal.aborted).toBe(true);
    expect(stopChatRun("user-a", "run-12345678")).toBe(false); // already stopped
  });

  it("never lets one student stop another's reply", () => {
    const controller = registerChatRun("user-a", "shared-run-id");
    expect(stopChatRun("user-b", "shared-run-id")).toBe(false);
    expect(controller.signal.aborted).toBe(false);
    releaseChatRun("user-a", "shared-run-id");
  });

  it("reports false for a run that finished or never existed", () => {
    registerChatRun("user-a", "finished-run");
    releaseChatRun("user-a", "finished-run");
    expect(stopChatRun("user-a", "finished-run")).toBe(false);
    expect(stopChatRun("user-a", "never-existed")).toBe(false);
  });
});
