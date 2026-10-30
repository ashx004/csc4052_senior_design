import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/src/library/firebaseAdmin";
import { isCloudBackend } from "@/src/library/ai/cloudModels";
import { billingMode } from "./usageMeter";
import { usdToMicros } from "./money";
import { trialKey } from "./trialEmail";

// A small free credit so a new student can try the AI before paying.
//   - Once per verified email address, kept even after the account is deleted
//     (trialGrants/{hash of the address}), so new accounts don't earn more.
//   - A site-wide cap on how many are ever given out bounds the total cost.
//   - Never refundable as cash: refunds only pay back Stripe purchases.
// TRIAL_CREDIT_USD=0 turns it off.

export function trialCreditMicros(): number {
  const usd = Number(process.env.TRIAL_CREDIT_USD ?? 0.25);
  return Number.isFinite(usd) && usd > 0 ? usdToMicros(Math.min(usd, 5)) : 0;
}

function trialLimit(): number {
  const n = Number(process.env.TRIAL_MAX_GRANTS ?? 200);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 200;
}

export type TrialCheck = {
  /** Credit given by this call (0 if none). */
  grantedMicros: number;
  /**
   * Set when the account would get the trial but its email isn't verified yet.
   * Email/password signups land on the dashboard before verifying, so without
   * this they saw $0 of credit and no reason why.
   */
  pendingVerificationMicros?: number;
};

const NO_TRIAL: TrialCheck = { grantedMicros: 0 };

/** Gives the trial if this account qualifies and hasn't had it, or says it is waiting on email verification. */
export async function checkTrial(uid: string, db: Firestore = adminDb): Promise<TrialCheck> {
  const amount = trialCreditMicros();
  if (!amount || billingMode() !== "enforce" || !isCloudBackend()) return NO_TRIAL;

  const walletRef = db.collection("wallets").doc(uid);
  // Cheap check first: nearly every call is for an account that already has a wallet.
  const existing = await walletRef.get();
  if (existing.exists && (existing.data()?.trialGrantedAt || existing.data()?.trialChecked)) return NO_TRIAL;

  // Read fresh from Firebase Auth, not from the browser's token, so the trial
  // arrives on the first page load after the student clicks the link.
  const user = await adminAuth.getUser(uid).catch(() => null);
  if (!user?.email) return NO_TRIAL;

  const grantRef = db.collection("trialGrants").doc(trialKey(user.email));
  const statsRef = db.collection("billingStats").doc("trials");

  if (!user.emailVerified) {
    // Still once per inbox, so nothing is given yet. Only promise it if this
    // address hasn't had one and trials haven't run out. Nothing is written,
    // so the check runs again once the address is verified.
    const [grant, stats] = await Promise.all([grantRef.get(), statsRef.get()]);
    const available = !grant.exists && Number(stats.data()?.count ?? 0) < trialLimit();
    return available ? { grantedMicros: 0, pendingVerificationMicros: amount } : NO_TRIAL;
  }

  return db.runTransaction(async (tx) => {
    const [grant, stats, wallet] = await Promise.all([tx.get(grantRef), tx.get(statsRef), tx.get(walletRef)]);
    const w = wallet.data() ?? {};
    if (w.trialGrantedAt || w.trialChecked) return NO_TRIAL;
    const given = Number(stats.data()?.count ?? 0);
    if (grant.exists || given >= trialLimit()) {
      // Remember the answer so this account isn't checked again on every page load.
      tx.set(walletRef, { trialChecked: true }, { merge: true });
      return NO_TRIAL;
    }
    const balanceMicros = Number(w.balanceMicros ?? 0) + amount;
    tx.set(grantRef, { uid, amountMicros: amount, at: FieldValue.serverTimestamp() });
    tx.set(statsRef, { count: given + 1, totalMicros: FieldValue.increment(amount) }, { merge: true });
    tx.set(walletRef, { balanceMicros, heldMicros: Number(w.heldMicros ?? 0), trialGrantedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(walletRef.collection("ledger").doc(), { type: "trial", amountMicros: amount, balanceAfterMicros: balanceMicros, at: FieldValue.serverTimestamp() });
    return { grantedMicros: amount };
  });
}

/** Gives the trial if this account qualifies and hasn't had it. Returns the amount given (0 if none). */
export async function grantTrialIfEligible(uid: string, db: Firestore = adminDb): Promise<number> {
  return (await checkTrial(uid, db)).grantedMicros;
}
