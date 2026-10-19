import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "now" } }));

import type { Firestore } from "firebase-admin/firestore";
import { InsufficientCreditError, creditPurchase, getWallet, planReserve, planSettle, releaseCredit, reserveCredit, settleCredit } from "./wallet";

// Just enough of Firestore for the wallet: doc refs by path, auto ids, and a
// transaction that buffers writes and applies them at the end.
type Data = Record<string, unknown>;
type Snap = { exists: boolean; data: () => Data | undefined };
type Ref = { path: string; id: string; get: () => Promise<Snap>; collection: (name: string) => Col };
type Col = { doc: (id?: string) => Ref };

function fakeDb() {
  const docs = new Map<string, Data>();
  let nextId = 0;
  const snap = (path: string): Snap => ({ exists: docs.has(path), data: () => docs.get(path) });
  const col = (path: string): Col => ({ doc: (id) => ref(`${path}/${id ?? `auto${nextId++}`}`) });
  const ref = (path: string): Ref => ({
    path,
    id: path.split("/").pop() ?? "",
    get: async () => snap(path),
    collection: (name) => col(`${path}/${name}`),
  });
  const runTransaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const writes: (() => void)[] = [];
    const tx = {
      get: async (r: Ref) => snap(r.path),
      set: (r: Ref, data: Data, opts?: { merge?: boolean }) => writes.push(() => docs.set(r.path, opts?.merge ? { ...docs.get(r.path), ...data } : data)),
      delete: (r: Ref) => writes.push(() => docs.delete(r.path)),
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  };
  return { docs, db: { collection: col, runTransaction } as unknown as Firestore };
}

describe("wallet planning", () => {
  it("refuses a hold larger than the available balance", () => {
    expect(() => planReserve({ balanceMicros: 100, heldMicros: 60 }, 50)).toThrow(InsufficientCreditError);
    expect(planReserve({ balanceMicros: 100, heldMicros: 60 }, 40)).toEqual({ balanceMicros: 100, heldMicros: 100 });
  });

  it("charges the actual cost even past the hold, since the provider already billed", () => {
    expect(planSettle({ balanceMicros: 100, heldMicros: 50 }, 50, 120)).toEqual({ balanceMicros: -20, heldMicros: 0 });
  });

  it("rejects non-integer or negative amounts", () => {
    expect(() => planReserve({ balanceMicros: 100, heldMicros: 0 }, 1.5)).toThrow();
    expect(() => planSettle({ balanceMicros: 100, heldMicros: 0 }, 0, -1)).toThrow();
  });
});

describe("wallet transactions", () => {
  let db: Firestore;
  let docs: Map<string, Data>;
  beforeEach(() => { ({ db, docs } = fakeDb()); });
  const ledger = (uid: string) => [...docs.entries()].filter(([p]) => p.startsWith(`wallets/${uid}/ledger/`)).map(([, d]) => d);

  it("credits a Stripe payment exactly once, however often the webhook retries", async () => {
    const stripe = { eventId: "evt_1", paidMicros: 10_000_000 };
    expect(await creditPurchase("alice", 9_410_000, stripe, db)).toBe(true);
    expect(await creditPurchase("alice", 9_410_000, stripe, db)).toBe(false);
    expect(await getWallet("alice", db)).toEqual({ balanceMicros: 9_410_000, heldMicros: 0 });
    expect(ledger("alice")).toHaveLength(1);
  });

  it("reserves, then settles at the actual cost with a ledger entry", async () => {
    await creditPurchase("alice", 1_000, { eventId: "evt_2", paidMicros: 1_000 }, db);
    const hold = await reserveCredit("alice", 600, "quiz", db);
    expect(await getWallet("alice", db)).toEqual({ balanceMicros: 1_000, heldMicros: 600 });
    await settleCredit("alice", hold, 250, { feature: "quiz", model: "m", inputTokens: 10, outputTokens: 5 }, db);
    expect(await getWallet("alice", db)).toEqual({ balanceMicros: 750, heldMicros: 0 });
    expect(ledger("alice").find((e) => e.type === "charge")).toMatchObject({ amountMicros: -250, balanceAfterMicros: 750, feature: "quiz" });
    await settleCredit("alice", hold, 250, { feature: "quiz" }, db); // replay: no double charge
    expect((await getWallet("alice", db)).balanceMicros).toBe(750);
  });

  it("blocks requests once held money uses up the balance", async () => {
    await creditPurchase("alice", 1_000, { eventId: "evt_3", paidMicros: 1_000 }, db);
    await reserveCredit("alice", 800, "chat", db);
    await expect(reserveCredit("alice", 300, "chat", db)).rejects.toBeInstanceOf(InsufficientCreditError);
  });

  it("releases a hold without charging", async () => {
    await creditPurchase("alice", 1_000, { eventId: "evt_4", paidMicros: 1_000 }, db);
    const hold = await reserveCredit("alice", 500, "ocr", db);
    await releaseCredit("alice", hold, "ocr", db);
    expect(await getWallet("alice", db)).toEqual({ balanceMicros: 1_000, heldMicros: 0 });
    expect(ledger("alice").filter((e) => e.type === "charge")).toHaveLength(0);
  });

  it("keeps each account's balance separate", async () => {
    await creditPurchase("alice", 1_000, { eventId: "evt_5", paidMicros: 1_000 }, db);
    await expect(reserveCredit("mallory", 1, "chat", db)).rejects.toBeInstanceOf(InsufficientCreditError);
    expect((await getWallet("alice", db)).balanceMicros).toBe(1_000);
  });
});
