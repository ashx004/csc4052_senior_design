import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: {}, adminAuth: { getUser: (uid: string) => getUser(uid) } }));
vi.mock("firebase-admin/firestore", () => ({ FieldValue: { serverTimestamp: () => "now", increment: (n: number) => ({ increment: n }) } }));

import type { Firestore } from "firebase-admin/firestore";
import { checkTrial, grantTrialIfEligible } from "./trial";
import { trialKey } from "./trialEmail";

// Just enough of Firestore for the trial: doc refs by path, auto ids, and a
// transaction that buffers writes and applies them at the end.
type Data = Record<string, unknown>;
type Snap = { exists: boolean; data: () => Data | undefined };
type Ref = { path: string; get: () => Promise<Snap>; collection: (name: string) => Col };
type Col = { doc: (id?: string) => Ref };

function fakeDb() {
  const docs = new Map<string, Data>();
  let nextId = 0;
  const snap = (path: string): Snap => ({ exists: docs.has(path), data: () => docs.get(path) });
  const col = (path: string): Col => ({ doc: (id) => ref(`${path}/${id ?? `auto${nextId++}`}`) });
  const ref = (path: string): Ref => ({ path, get: async () => snap(path), collection: (name) => col(`${path}/${name}`) });
  const runTransaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const writes: (() => void)[] = [];
    const tx = {
      get: async (r: Ref) => snap(r.path),
      set: (r: Ref, data: Data, opts?: { merge?: boolean }) => writes.push(() => docs.set(r.path, opts?.merge ? { ...docs.get(r.path), ...data } : data)),
    };
    const result = await fn(tx);
    writes.forEach((w) => w());
    return result;
  };
  return { docs, db: { collection: col, runTransaction } as unknown as Firestore };
}

const EMAIL = "new.student@example.com";
const TRIAL = 250_000;

describe("free trial credit", () => {
  let db: Firestore;
  let docs: Map<string, Data>;

  beforeEach(() => {
    ({ db, docs } = fakeDb());
    vi.stubEnv("BILLING_MODE", "enforce");
    vi.stubEnv("AI_BACKEND", "cloud");
    vi.stubEnv("TRIAL_CREDIT_USD", "0.25");
    vi.stubEnv("TRIAL_MAX_GRANTS", "200");
    getUser.mockReset();
  });

  afterEach(() => vi.unstubAllEnvs());

  it("gives a verified new account the trial once", async () => {
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: true });
    expect(await checkTrial("u1", db)).toEqual({ grantedMicros: TRIAL });
    expect(docs.get("wallets/u1")?.balanceMicros).toBe(TRIAL);
    expect(await grantTrialIfEligible("u1", db)).toBe(0);
  });

  it("tells an unverified account the trial is waiting, without giving or recording anything", async () => {
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: false });
    expect(await checkTrial("u1", db)).toEqual({ grantedMicros: 0, pendingVerificationMicros: TRIAL });
    expect(docs.has("wallets/u1")).toBe(false);
    expect(docs.has(`trialGrants/${trialKey(EMAIL)}`)).toBe(false);
  });

  it("gives the trial on the first check after the email is verified", async () => {
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: false });
    await checkTrial("u1", db);
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: true });
    expect(await checkTrial("u1", db)).toEqual({ grantedMicros: TRIAL });
  });

  it("doesn't promise a trial to an address that already had one", async () => {
    docs.set(`trialGrants/${trialKey(EMAIL)}`, { uid: "old-account" });
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: false });
    expect(await checkTrial("u2", db)).toEqual({ grantedMicros: 0 });
  });

  it("doesn't promise a trial once they've run out", async () => {
    docs.set("billingStats/trials", { count: 200 });
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: false });
    expect(await checkTrial("u1", db)).toEqual({ grantedMicros: 0 });
  });

  it("does nothing when billing isn't enforced", async () => {
    vi.stubEnv("BILLING_MODE", "log");
    getUser.mockResolvedValue({ email: EMAIL, emailVerified: false });
    expect(await checkTrial("u1", db)).toEqual({ grantedMicros: 0 });
    expect(getUser).not.toHaveBeenCalled();
  });
});
