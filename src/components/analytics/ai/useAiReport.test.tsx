// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAiReport } from "./useAiReport";

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

it("fetches the report for the window and returns it", async () => {
  fetchMock.mockResolvedValue(Response.json({ source: "live" }));
  const { result } = renderHook(() => useAiReport(14));
  expect(result.current).toEqual({ report: null, error: null, loading: true });
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/ai-usage?days=14");
  expect(result.current).toEqual({ report: { source: "live" }, error: null, loading: false });
});

it("asks for one feature when given one", async () => {
  fetchMock.mockResolvedValue(Response.json({}));
  const { result } = renderHook(() => useAiReport(7, "quiz-generation"));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(fetchMock.mock.calls[0][0]).toBe("/api/admin/ai-usage?days=7&feature=quiz-generation");
});

it("surfaces the server's own error message, so the quota message reaches the admin", async () => {
  const message = "Live monitoring data is unavailable: the daily Firestore read quota is used up. It resets at midnight Pacific.";
  fetchMock.mockResolvedValue(Response.json({ error: message }, { status: 503 }));
  const { result } = renderHook(() => useAiReport(7));
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current).toEqual({ report: null, error: message, loading: false });
});
