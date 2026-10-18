import "server-only";
import { FieldValue, type Firestore, type Transaction } from "firebase-admin/firestore";
import { adminDb } from "@/src/library/firebaseAdmin";

// AI credit wallet. Layout (see firestore.rules, which deny every client write):
//   wallets/{uid}                 { balanceMicros, heldMicros, updatedAt }
//   wallets/{uid}/holds/{holdId}  money reserved for a request still running
//   wallets/{uid}/ledger/{id}     append-only history: purchases, charges, refunds
//   stripeEvents/{eventId}        Stripe events already applied (idempotency)
// The wallet id IS the Firebase uid, and callers pass the uid from a verified
// token, never from the request body, so one account can never spend another's.

export class InsufficientCreditError extends Error {
  constructor(public availableMicros: number, public neededMicros: number) {
    super("Not enough AI credit for this request.");
    this.name = "InsufficientCreditError";
  }
}

export type WalletState = { balanceMicros: number; heldMicros: number };
export type ChargeDetails = { feature: string; model?: string; inputTokens?: number; outputTokens?: number; rateId?: string };

export const EMPTY_WALLET: WalletState = { balanceMicros: 0, heldMicros: 0 };

/** Pure: what a reservation does to a wallet, or why it can't happen. */
export function planReserve(wallet: WalletState, amountMicros: number): WalletState {
  if (!Number.isInteger(amountMicros) || amountMicros <= 0) throw new Error("Reserve amount must be a positive integer.");
  const available = wallet.balanceMicros - wallet.heldMicros;
  if (available < amountMicros) throw new InsufficientCreditError(Math.max(0, available), amountMicros);
  return { ...wallet, heldMicros: wallet.heldMicros + amountMicros };
}

/**
 * Pure: settle a hold at the provider's actual cost. The actual cost is charged
 * even if it exceeds the hold: the provider has already billed ZonoCSC, so the
 * balance may dip slightly below zero, and the next reserve is refused until topped up.
 */
export function planSettle(wallet: WalletState, holdMicros: number, actualMicros: number): WalletState {
  if (!Number.isInteger(actualMicros) || actualMicros < 0) throw new Error("Actual cost must be a non-negative integer.");
  return { balanceMicros: wallet.balanceMicros - actualMicros, heldMicros: Math.max(0, wallet.heldMicros - holdMicros) };
}

const walletRef = (db: Firestore, uid: string) => db.collection("wallets").doc(uid);

async function readWallet(tx: Transaction, db: Firestore, uid: string): Promise<WalletState> {
  const snap = await tx.get(walletRef(db, uid));
  const data = snap.exists ? snap.data() : undefined;
  return { balanceMicros: Number(data?.balanceMicros ?? 0), heldMicros: Number(data?.heldMicros ?? 0) };
}

function writeLedger(tx: Transaction, db: Firestore, uid: string, entry: Record<string, unknown>) {
  tx.set(walletRef(db, uid).collection("ledger").doc(), { ...entry, at: FieldValue.serverTimestamp() });
}

export async function getWallet(uid: string, db: Firestore = adminDb): Promise<WalletState> {
  const snap = await walletRef(db, uid).get();
  const data = snap.exists ? snap.data() : undefined;
  return { balanceMicros: Number(data?.balanceMicros ?? 0), heldMicros: Number(data?.heldMicros ?? 0) };
}

/** Holds `amountMicros` for a request about to run. Throws InsufficientCreditError when the balance can't cover it. */
export async function reserveCredit(uid: string, amountMicros: number, feature: string, db: Firestore = adminDb): Promise<string> {
  const holdRef = walletRef(db, uid).collection("holds").doc();
  await db.runTransaction(async (tx) => {
    const next = planReserve(await readWallet(tx, db, uid), amountMicros);
    tx.set(walletRef(db, uid), { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(holdRef, { amountMicros, feature, createdAt: FieldValue.serverTimestamp() });
  });
  return holdRef.id;
}

/** Charges the actual cost of a finished request and releases its hold. Settling the same hold twice is a no-op. */
export async function settleCredit(uid: string, holdId: string, actualMicros: number, details: ChargeDetails, db: Firestore = adminDb): Promise<void> {
  const holdRef = walletRef(db, uid).collection("holds").doc(holdId);
  await db.runTransaction(async (tx) => {
    const hold = await tx.get(holdRef);
    if (!hold.exists) return;
    const next = planSettle(await readWallet(tx, db, uid), Number(hold.data()?.amountMicros ?? 0), actualMicros);
    tx.set(walletRef(db, uid), { ...next, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.delete(holdRef);
    if (actualMicros > 0) writeLedger(tx, db, uid, { type: "charge", amountMicros: -actualMicros, balanceAfterMicros: next.balanceMicros, ...details });
  });
}

/** Releases a hold without charging, for a request that never reached the provider. */
export function releaseCredit(uid: string, holdId: string, feature: string, db: Firestore = adminDb): Promise<void> {
  return settleCredit(uid, holdId, 0, { feature }, db);
}

/**
 * Adds purchased credit. Only the signature-verified Stripe webhook may call this,
 * with amounts taken from Stripe's event, never from the browser. Applying the
 * same Stripe event twice is a no-op, since Stripe retries webhooks.
 */
export async function creditPurchase(
  uid: string,
  creditMicros: number,
  stripe: { eventId: string; paymentIntentId?: string; paidMicros: number },
  db: Firestore = adminDb
): Promise<boolean> {
  if (!Number.isInteger(creditMicros) || creditMicros < 0) throw new Error("Credit must be a non-negative integer.");
  const eventRef = db.collection("stripeEvents").doc(stripe.eventId);
  return db.runTransaction(async (tx) => {
    if ((await tx.get(eventRef)).exists) return false;
    const wallet = await readWallet(tx, db, uid);
    const balanceMicros = wallet.balanceMicros + creditMicros;
    tx.set(eventRef, { uid, creditMicros, paidMicros: stripe.paidMicros, paymentIntentId: stripe.paymentIntentId ?? null, appliedAt: FieldValue.serverTimestamp() });
    tx.set(walletRef(db, uid), { balanceMicros, heldMicros: wallet.heldMicros, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    writeLedger(tx, db, uid, { type: "purchase", amountMicros: creditMicros, balanceAfterMicros: balanceMicros, paidMicros: stripe.paidMicros, stripeEventId: stripe.eventId, paymentIntentId: stripe.paymentIntentId ?? null });
    return true;
  });
}
