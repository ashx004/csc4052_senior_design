// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useAdminReport } from "./useAdminReport";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("describes an HTML gateway response without exposing its contents", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockImplementation(
      () =>
        new Response("<!DOCTYPE html><p>private proxy details</p>", {
          status: 502,
          headers: { "content-type": "text/html" },
        }),
    ),
  );
  const { result } = renderHook(() =>
    useAdminReport("/api/admin/analytics/realtime", 0),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toBeNull();
  expect(result.current.error).toContain("HTTP 502");
  expect(result.current.error).toContain("deployment and proxy logs");
  expect(result.current.error).not.toContain("private proxy details");
  expect(result.current.error).not.toContain("Unexpected token");
});

it("stops polling when access is denied even if the error response is HTML", async () => {
  vi.useFakeTimers();
  const fetchMock = vi.fn().mockResolvedValue(
    new Response("<html>Forbidden</html>", {
      status: 403,
      headers: { "content-type": "text/html" },
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() =>
    useAdminReport("/api/admin/health", 0, true),
  );
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  expect(result.current.error).toContain("Access to this report was denied");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(120_000);
  });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it("handles malformed JSON without showing raw parser errors", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response("not-json", {
        headers: { "content-type": "application/json" },
      }),
    ),
  );
  const { result } = renderHook(() => useAdminReport("/api/admin/health", 0));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.error).toBe(
    "The server returned invalid report data (HTTP 200). Please try again.",
  );
  expect(result.current.data).toBeNull();
});

it("recovers from a temporary HTML gateway failure with one retry", async () => {
  const report = { concurrentUsers: 2 };
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      new Response("<html>Bad gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
    )
    .mockResolvedValueOnce(Response.json(report));
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() =>
    useAdminReport("/api/admin/analytics/realtime", 0),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.data).toEqual(report);
  expect(result.current.error).toBe("");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

it("limits persistent gateway failures to two attempts", async () => {
  const fetchMock = vi.fn().mockImplementation(
    () =>
      new Response("<html>Bad gateway</html>", {
        status: 502,
        headers: { "content-type": "text/html" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const { result } = renderHook(() =>
    useAdminReport("/api/admin/analytics/realtime", 0),
  );
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(result.current.data).toBeNull();
  expect(result.current.error).toContain("HTTP 502");
});

it.each([429, 503])(
  "does not retry JSON application errors (HTTP %s)",
  async (status) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: "Try again later." }, { status }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() =>
      useAdminReport("/api/admin/analytics/realtime", 0),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.error).toBe("Try again later.");
  },
);
