import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ reportError: vi.fn(), checkRateLimit: vi.fn() }));
vi.mock("@/src/library/monitoring/errorReporter", () => ({ reportError: mocks.reportError }));
vi.mock("@/src/library/rateLimit", () => ({ checkRateLimit: mocks.checkRateLimit }));

import { POST } from "./route";

function post(body: unknown) {
  return POST(
    new NextRequest("https://catalyst.test/api/client-errors", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      headers: { "user-agent": "TestBrowser/1.0" },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.checkRateLimit.mockReturnValue({ allowed: true });
});

it("records a valid browser error as a client error, without the query string", async () => {
  const response = await post({ message: "x is undefined", route: "/notes?token=secret" });
  expect(response.status).toBe(204);
  expect(mocks.reportError).toHaveBeenCalledWith(
    expect.objectContaining({ source: "client", message: "x is undefined", route: "/notes", userAgent: "TestBrowser/1.0" }),
  );
});

it("cannot be used to report a server error", async () => {
  await post({ message: "boom", source: "server" });
  expect(mocks.reportError).toHaveBeenCalledWith(expect.objectContaining({ source: "client" }));
});

it("rejects malformed and oversized bodies", async () => {
  expect((await post("not json")).status).toBe(400);
  expect((await post({ route: "/notes" })).status).toBe(400);
  expect((await post({ message: "a".repeat(20_000) })).status).toBe(413);
  expect(mocks.reportError).not.toHaveBeenCalled();
});

it("rate limits per client", async () => {
  mocks.checkRateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 30 });
  const response = await post({ message: "boom" });
  expect(response.status).toBe(429);
  expect(mocks.reportError).not.toHaveBeenCalled();
});
