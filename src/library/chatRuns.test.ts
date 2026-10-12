import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatStoppedError, enterChatStopScope, registerChatRun, releaseChatRun, stopChatRun, untilStopped } from "./chatRuns";
import { structuredGeneration } from "./structuredGeneration";

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

describe("stopping a tool that is already running", () => {
  beforeEach(() => {
    vi.stubEnv("OLLAMA_MODEL_MAIN", "test-model");
  });
  afterEach(() => {
    enterChatStopScope(undefined);
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("untilStopped gives up the moment Stop is pressed", async () => {
    const controller = new AbortController();
    const slow = new Promise<string>(() => {}); // never finishes
    const waiting = untilStopped(slow, controller.signal);
    controller.abort();
    await expect(waiting).rejects.toBeInstanceOf(ChatStoppedError);
  });

  it("untilStopped passes results and errors through when Stop is not pressed", async () => {
    const controller = new AbortController();
    await expect(untilStopped(Promise.resolve("ok"), controller.signal)).resolves.toBe("ok");
    await expect(untilStopped(Promise.reject(new Error("boom")), controller.signal)).rejects.toThrow("boom");
    await expect(untilStopped(Promise.resolve("no signal"), undefined)).resolves.toBe("no signal");
  });

  it("untilStopped refuses at once if Stop was already pressed", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(untilStopped(Promise.resolve("late"), controller.signal)).rejects.toBeInstanceOf(ChatStoppedError);
  });

  it("cancels a generation request in flight inside a chat reply", async () => {
    const controller = new AbortController();
    enterChatStopScope(controller.signal);
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => init.signal?.addEventListener("abort", () => reject(new Error("aborted")))))
    );
    const generating = structuredGeneration({
      baseUrl: "http://example.invalid",
      feature: "quiz",
      messages: [{ role: "user", content: "x" }],
      schema: {},
      deadline: Date.now() + 60_000,
    });
    controller.abort();
    await expect(generating).rejects.toThrow("aborted");
  });

  it("leaves generation alone outside a chat reply", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined();
      return new Response(JSON.stringify({ message: { content: '{"a":1}' }, done_reason: "stop" }));
    }));
    const raw = await structuredGeneration({ baseUrl: "http://example.invalid", feature: "quiz", messages: [], schema: {}, deadline: Date.now() + 60_000 });
    expect(raw).toEqual({ a: 1 });
  });
});

describe("structuredGeneration crash fallback", () => {
  beforeEach(() => vi.stubEnv("OLLAMA_MODEL_MAIN", "test-model"));
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });
  const call = () =>
    structuredGeneration({ baseUrl: "http://example.invalid", feature: "practice", messages: [], schema: { type: "object" }, deadline: Date.now() + 60_000 });
  const okReply = () => new Response(JSON.stringify({ message: { content: '{"ok":true}' }, done_reason: "stop" }));

  it("retries once in JSON mode when the model runner crashed", async () => {
    const crash = () => new Response('{"error":"model runner has unexpectedly stopped, this may be due to resource limitations"}', { status: 500 });
    const fetchMock = vi.fn().mockResolvedValueOnce(crash()).mockResolvedValueOnce(okReply());
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).format).toEqual({ type: "object" });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).format).toBe("json");
  });

  it("does not retry a plain server error or an overloaded service", async () => {
    for (const status of [500, 503, 429]) {
      const fetchMock = vi.fn().mockResolvedValue(new Response("unavailable", { status }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(call()).rejects.toThrow(`HTTP ${status}`);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("retries once after a dropped connection", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(okReply());
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up if the JSON-mode retry fails too", async () => {
    const crash = () => new Response("llama runner process has terminated: exit status 2", { status: 500 });
    const fetchMock = vi.fn().mockImplementation(async () => crash());
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow("HTTP 500");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a timeout", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(call()).rejects.toThrow("timed out");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
