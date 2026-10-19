import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "now", increment: (n: number) => ({ increment: n }) } }));

const wallet = vi.hoisted(() => ({
  reserveCredit: vi.fn(),
  settleCredit: vi.fn(),
  releaseCredit: vi.fn(),
  chargeDirect: vi.fn(),
  getWallet: vi.fn(),
}));
vi.mock("./wallet", async () => ({ ...(await vi.importActual<object>("./wallet")), ...wallet }));

import type { Firestore } from "firebase-admin/firestore";
import type { UsageEvent } from "@/src/library/ai/aiFetch";
import { createMeter } from "./usageMeter";
import { InsufficientCreditError } from "./wallet";

const event: UsageEvent = { uid: "s1", requestId: "gen-1", feature: "chat", model: "openrouter:m", inputTokens: 10, outputTokens: 5, costMicros: 945, costSource: "provider", fallback: false };
let added: Record<string, unknown>[];
const db = () => ({ collection: (name: string) => (expect(name).toBe("aiUsage"), { add: async (d: Record<string, unknown>) => added.push(d) }) }) as unknown as Firestore;

beforeEach(() => {
  added = [];
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Object.values(wallet).forEach((f) => f.mockReset());
  wallet.reserveCredit.mockResolvedValue("hold-1");
});
afterEach(() => { delete process.env.BILLING_MODE; vi.restoreAllMocks(); });

describe("log mode (dry run)", () => {
  it("records what the request would cost, OpenRouter's fee included, without touching the wallet", async () => {
    const session = await createMeter(db()).start({ uid: "s1", feature: "chat", holdMicros: 5000 });
    await session.finish(event);
    expect(added[0]).toMatchObject({ uid: "s1", costMicros: 945, chargeMicros: 1000, charged: false, requestId: "gen-1" });
    expect(wallet.reserveCredit).not.toHaveBeenCalled();
  });

  it("records unattributed requests and warns", async () => {
    const session = await createMeter(db()).start({ feature: "ocr", holdMicros: 1 });
    await session.finish({ ...event, uid: undefined, feature: "ocr" });
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("unattributed ocr"));
    expect(added[0]).toMatchObject({ uid: null });
  });
});

describe("enforce mode (paywall)", () => {
  beforeEach(() => { process.env.BILLING_MODE = "enforce"; });

  it("holds before the request and charges the real cost plus fee after", async () => {
    const session = await createMeter(db()).start({ uid: "s1", feature: "chat", holdMicros: 5000 });
    expect(wallet.reserveCredit).toHaveBeenCalledWith("s1", 5000, "chat", expect.anything());
    await session.finish(event);
    expect(wallet.settleCredit).toHaveBeenCalledWith("s1", "hold-1", 1000, expect.objectContaining({ feature: "chat" }), expect.anything());
    expect(added[0]).toMatchObject({ chargeMicros: 1000, charged: true });
  });

  it("refuses a request with no student instead of giving it away", async () => {
    await expect(createMeter(db()).start({ feature: "chat", holdMicros: 5000 })).rejects.toMatchObject({ name: "UnattributedAiError" });
  });

  it("passes the wallet's refusal through when credit runs out", async () => {
    wallet.reserveCredit.mockRejectedValue(new InsufficientCreditError(10, 5000));
    await expect(createMeter(db()).start({ uid: "s1", feature: "chat", holdMicros: 5000 })).rejects.toBeInstanceOf(InsufficientCreditError);
  });

  it("releases the hold when the provider failed", async () => {
    const session = await createMeter(db()).start({ uid: "s1", feature: "chat", holdMicros: 5000 });
    await session.abandon();
    expect(wallet.releaseCredit).toHaveBeenCalledWith("s1", "hold-1", "chat", expect.anything());
  });

  it("charges the hold for a stopped stream whose cost can't be looked up", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("nope", { status: 404 })));
    process.env.OPENROUTER_API_KEY = "k";
    const session = await createMeter(db()).start({ uid: "s1", feature: "chat", holdMicros: 5000 });
    const done = session.finish({ ...event, incomplete: true, costMicros: 0 });
    await vi.runAllTimersAsync();
    await done;
    expect(wallet.settleCredit).toHaveBeenCalledWith("s1", "hold-1", 5000, expect.anything(), expect.anything());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("looks up a stopped stream's real cost from OpenRouter", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ data: { total_cost: 0.000189, native_tokens_prompt: 20, native_tokens_completion: 7 } })));
    process.env.OPENROUTER_API_KEY = "k";
    const session = await createMeter(db()).start({ uid: "s1", feature: "chat", holdMicros: 5000 });
    const done = session.finish({ ...event, incomplete: true, costMicros: 0 });
    await vi.runAllTimersAsync();
    await done;
    expect(wallet.settleCredit).toHaveBeenCalledWith("s1", "hold-1", 200, expect.objectContaining({ outputTokens: 7 }), expect.anything());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("checks then charges bulk chunking calls without a hold", async () => {
    wallet.getWallet.mockResolvedValue({ balanceMicros: 10_000, heldMicros: 0 });
    const session = await createMeter(db()).start({ uid: "s1", feature: "contextual-chunking", holdMicros: 300 });
    await session.finish({ ...event, feature: "contextual-chunking" });
    expect(wallet.reserveCredit).not.toHaveBeenCalled();
    expect(wallet.chargeDirect).toHaveBeenCalledWith("s1", 1000, expect.anything(), expect.anything());
  });

  it("refuses bulk calls once the balance is gone", async () => {
    wallet.getWallet.mockResolvedValue({ balanceMicros: 100, heldMicros: 0 });
    await expect(createMeter(db()).start({ uid: "s1", feature: "contextual-chunking", holdMicros: 300 })).rejects.toBeInstanceOf(InsufficientCreditError);
  });
});
