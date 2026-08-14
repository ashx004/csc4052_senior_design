import { describe, expect, it, vi, beforeEach } from "vitest";
import { fetchCourseFile } from "./fetchCourseFile";

describe("fetchCourseFile", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends the session cookie and a Bearer token, and does not cache", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCourseFile("/api/download?key=users%2Fu1%2Ffile.pdf", "id-token");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/download?key=users%2Fu1%2Ffile.pdf");
    expect(init.credentials).toBe("include");
    expect(init.cache).toBe("no-store");
    const headers = new Headers(init.headers);
    expect(headers.get("Authorization")).toBe("Bearer id-token");
  });

  it("omits Authorization when no id token is available", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await fetchCourseFile("/api/download?key=users%2Fu1%2Ffile.pdf");

    const headers = new Headers(fetchMock.mock.calls[0][1].headers);
    expect(headers.has("Authorization")).toBe(false);
  });
});
