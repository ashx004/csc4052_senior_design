import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>();
  return {
    docs,
    sendEmail: vi.fn(),
    adminDb: {
      collection: () => ({ doc: (id: string) => ({ id }) }),
      runTransaction: async (fn: (t: unknown) => Promise<unknown>) =>
        fn({
          get: async (ref: { id: string }) => ({ exists: docs.has(ref.id), data: () => docs.get(ref.id) }),
          set: (ref: { id: string }, value: Record<string, unknown>) => docs.set(ref.id, value),
        }),
    },
  };
});
vi.mock("../firebaseAdmin", () => ({ adminDb: mocks.adminDb }));
vi.mock("../email/resend", () => ({ sendEmail: mocks.sendEmail }));

import { buildAlertEmail, reportError } from "./errorReporter";

beforeEach(() => {
  mocks.docs.clear();
  mocks.sendEmail.mockReset().mockResolvedValue({});
  vi.stubEnv("ALERT_EMAILS", "a@team.test, b@team.test");
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("reportError", () => {
  it("records a new error and emails every alert address once", async () => {
    await reportError({ source: "server", message: "Quiz generation failed", route: "/api/generate-quiz" });
    expect(mocks.docs.size).toBe(1);
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendEmail.mock.calls.map(([input]) => input.to)).toEqual(["a@team.test", "b@team.test"]);

    await reportError({ source: "server", message: "Quiz generation failed", route: "/api/generate-quiz" });
    expect(mocks.sendEmail).toHaveBeenCalledTimes(2);
    expect((mocks.docs.values().next().value as { state: { count: number } }).state.count).toBe(2);
  });

  it("skips browser noise entirely", async () => {
    await reportError({ source: "client", message: "TypeError: Failed to fetch" });
    expect(mocks.docs.size).toBe(0);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });

  it("never throws, even when Firestore is down", async () => {
    const original = mocks.adminDb.runTransaction;
    mocks.adminDb.runTransaction = async () => {
      throw new Error("Firestore unavailable");
    };
    await expect(reportError({ source: "server", message: "boom" })).resolves.toBeUndefined();
    mocks.adminDb.runTransaction = original;
  });
});

describe("buildAlertEmail", () => {
  it("escapes error text so a reported message can't inject html", () => {
    const { html, subject } = buildAlertEmail("abc", "new", {
      source: "client",
      message: '<img src=x onerror="alert(1)">',
      route: "/notes",
    });
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
    expect(subject).toContain("New error (Browser)");
  });
});
