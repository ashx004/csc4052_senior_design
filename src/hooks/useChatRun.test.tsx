// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, renderHook } from "@testing-library/react";
import { useChatRun } from "./useChatRun";
import { RUN_ID_PATTERN } from "@/src/library/chatRequest";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useChatRun (Stop button)", () => {
  it("makes run IDs the server will accept, a fresh one each time", () => {
    const { result } = renderHook(() => useChatRun());
    const first = result.current.begin();
    const second = result.current.begin();
    expect(first.runId).toMatch(RUN_ID_PATTERN);
    expect(second.runId).toMatch(RUN_ID_PATTERN);
    expect(first.runId).not.toBe(second.runId);
  });

  it("tells the server to stop that run, once, and remembers that it was stopped", () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}"));
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChatRun());
    const { runId } = result.current.begin();
    expect(result.current.wasStopped()).toBe(false);

    act(() => {
      result.current.stop();
      result.current.stop(); // double click
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat/stop");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ runId });
    expect(result.current.wasStopped()).toBe(true);
  });

  it("cuts the connection itself if the server never closes the stream after Stop", () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}")));
    const { result } = renderHook(() => useChatRun());
    const { signal } = result.current.begin();
    act(() => result.current.stop());
    expect(signal.aborted).toBe(false);
    act(() => {
      vi.advanceTimersByTime(4_500);
    });
    expect(signal.aborted).toBe(true);
  });

  it("does nothing when there is no reply to stop", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => useChatRun());
    act(() => result.current.stop());
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
