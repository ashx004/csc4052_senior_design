import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "now" } }));

import type { Firestore } from "firebase-admin/firestore";
import type { UsageEvent } from "@/src/library/ai/aiFetch";
import { meterUsage } from "./usageMeter";

const event: UsageEvent = { uid: "s1", requestId: "gen-1", feature: "chat", model: "openrouter:m", inputTokens: 10, outputTokens: 5, costMicros: 42, costSource: "provider", fallback: false };
const fakeDb = (add: (data: unknown) => Promise<unknown>) => ({ collection: (name: string) => (expect(name).toBe("aiUsage"), { add }) }) as unknown as Firestore;

afterEach(() => { delete process.env.BILLING_MODE; vi.restoreAllMocks(); });

describe("meterUsage (log-only)", () => {
  it("records the student and cost without charging", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const add = vi.fn().mockResolvedValue({});
    await meterUsage(event, fakeDb(add));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ uid: "s1", costMicros: 42, requestId: "gen-1", incomplete: false, charged: false, at: "now" }));
  });

  it("warns about unattributed requests and still records them", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const add = vi.fn().mockResolvedValue({});
    await meterUsage({ ...event, uid: undefined }, fakeDb(add));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("unattributed chat"));
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ uid: null }));
  });

  it("never throws when Firestore is down", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(meterUsage(event, fakeDb(() => Promise.reject(new Error("unavailable"))))).resolves.toBeUndefined();
  });

  it("records nothing when BILLING_MODE=off", async () => {
    vi.spyOn(console, "info").mockImplementation(() => {});
    process.env.BILLING_MODE = "off";
    const add = vi.fn();
    await meterUsage(event, fakeDb(add));
    expect(add).not.toHaveBeenCalled();
  });
});
