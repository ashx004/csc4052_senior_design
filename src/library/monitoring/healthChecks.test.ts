import { afterEach, describe, expect, it, vi } from "vitest";
import { runHealthChecks } from "./healthChecks";

afterEach(() => vi.restoreAllMocks());

describe("runHealthChecks", () => {
  it("is ok only when every check passes", async () => {
    const report = await runHealthChecks({
      database: async () => {},
      storage: async () => {},
      ai: async () => {},
    });
    expect(report.status).toBe("ok");
    expect(Object.values(report.checks).every((c) => c.ok)).toBe(true);
  });

  it("is down when one check fails, without exposing why", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const report = await runHealthChecks({
      database: async () => {},
      storage: async () => {},
      ai: async () => {
        throw new Error("Secondary Ollama box is unreachable at http://100.99.192.29:11434");
      },
    });
    expect(report.status).toBe("down");
    expect(report.checks.ai.ok).toBe(false);
    expect(report.checks.database.ok).toBe(true);
    expect(JSON.stringify(report)).not.toContain("100.99");
  });
});
