import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { monitoredFetch, observeOperation, setIncidentSink } from "./telemetry";
const sink = vi.fn().mockResolvedValue(undefined);
const fetchMock = vi.fn();
beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetchMock);
  setIncidentSink(sink);
});
afterEach(() => {
  setIncidentSink(undefined);
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("records failures without changing the service response or disclosing request data", async () => {
  fetchMock.mockResolvedValue(
    new Response("secret upstream body", { status: 503 }),
  );
  const response = await monitoredFetch("ai", "https://secret-host/path", {
    body: "private student prompt",
  });
  expect(response.status).toBe(503);
  expect(sink).toHaveBeenCalledWith("ai", "request_failure");
  expect(JSON.stringify(sink.mock.calls)).not.toContain("secret");
});

it("distinguishes deadline expiry from a student pressing Stop", async () => {
  const timeout = new AbortController();
  timeout.abort(new Error("Qdrant search timed out after 10s"));
  fetchMock.mockRejectedValueOnce(timeout.signal.reason);
  await expect(
    monitoredFetch("vector", "http://service", { signal: timeout.signal }),
  ).rejects.toThrow();
  expect(sink).toHaveBeenCalledWith("vector", "timeout");
  sink.mockClear();
  const stop = new AbortController();
  stop.abort();
  fetchMock.mockRejectedValueOnce(stop.signal.reason);
  await expect(
    monitoredFetch("ai", "http://service", { signal: stop.signal }),
  ).rejects.toThrow();
  expect(sink).not.toHaveBeenCalled();
});

it("records slow streaming generation and preserves bytes", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  fetchMock.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          source = controller;
        },
      }),
    ),
  );
  const response = await monitoredFetch("ai", "http://service", {});
  const body = response.text();
  await vi.advanceTimersByTimeAsync(30_001);
  expect(sink).toHaveBeenCalledWith("ai", "slow_generation");
  source.enqueue(new TextEncoder().encode("hello"));
  source.close();
  expect(await body).toBe("hello");
  expect(vi.getTimerCount()).toBe(0);
});

it("records a mid-stream failure and clears observation on cancellation", async () => {
  let source!: ReadableStreamDefaultController<Uint8Array>;
  fetchMock.mockResolvedValue(
    new Response(
      new ReadableStream({
        start(controller) {
          source = controller;
        },
      }),
    ),
  );
  const response = await monitoredFetch("ai", "http://service", {});
  const consumed = response.text();
  source.error(new Error("network failure"));
  await expect(consumed).rejects.toThrow("network failure");
  expect(sink).toHaveBeenCalledWith("ai", "request_failure");
  fetchMock.mockResolvedValue(new Response(new ReadableStream()));
  const canceled = await monitoredFetch("ai", "http://service", {});
  await canceled.body!.cancel();
  expect(vi.getTimerCount()).toBe(0);
});

it("keeps monitoring errors from breaking application traffic", async () => {
  sink.mockRejectedValueOnce(new Error("Firestore down"));
  fetchMock.mockResolvedValue(new Response("oops", { status: 500 }));
  expect((await monitoredFetch("vector", "http://service", {})).status).toBe(
    500,
  );
});

it("records SDK deadline errors as timeouts while preserving the original error", async () => {
  const error = Object.assign(new Error("upstream timeout"), {
    code: "ETIMEDOUT",
  });
  await expect(
    observeOperation("storage", async () => {
      throw error;
    }),
  ).rejects.toBe(error);
  expect(sink).toHaveBeenCalledWith("storage", "timeout");
});
