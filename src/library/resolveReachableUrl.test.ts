import { describe, expect, it, vi } from "vitest";
import { resolveReachableUrl } from "./resolveReachableUrl";

// Reachability is cached per URL at module level, so each test uses its own
// hostnames to stay independent.
const probeOnly = (...up: string[]) => vi.fn(async (url: string) => up.includes(url));

describe("resolveReachableUrl", () => {
  it("returns the base URL untouched when there's no fallback", async () => {
    const probe = probeOnly();
    expect(await resolveReachableUrl("http://a-lan", undefined, probe)).toBe("http://a-lan");
    expect(probe).not.toHaveBeenCalled();
  });

  it("prefers the base URL when it's reachable (the public site on the LAN)", async () => {
    const probe = probeOnly("http://b-lan");
    expect(await resolveReachableUrl("http://b-lan", "http://b-ts,https://b-cf", probe)).toBe("http://b-lan");
  });

  it("walks a comma-separated fallback list in order (a teammate on Tailscale)", async () => {
    const probe = probeOnly("http://c-ts");
    expect(await resolveReachableUrl("http://c-lan", "http://c-ts, https://c-cf", probe)).toBe("http://c-ts");
  });

  it("returns the last fallback unprobed when nothing earlier answers", async () => {
    const probe = probeOnly();
    expect(await resolveReachableUrl("http://d-lan", "http://d-ts,https://d-cf", probe)).toBe("https://d-cf");
    expect(probe).not.toHaveBeenCalledWith("https://d-cf");
  });

  it("keeps the old single-fallback behavior", async () => {
    const probe = probeOnly();
    expect(await resolveReachableUrl("http://e-lan", "https://e-cf", probe)).toBe("https://e-cf");
  });

  it("skips an empty base URL and duplicate entries", async () => {
    const probe = probeOnly("http://f-ts");
    expect(await resolveReachableUrl("", "http://f-ts,http://f-ts,https://f-cf", probe)).toBe("http://f-ts");
  });
});
