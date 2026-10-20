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

/** Gives the trial if this account qualifies and hasn't had it. Returns the amount given (0 if none). */
export async function grantTrialIfEligible(uid: string, db: Firestore = adminDb): Promise<number> {
  const amount = trialCreditMicros();
  if (!amount || billingMode() !== "enforce" || !isCloudBackend()) return 0;

  const walletRef = db.collection("wallets").doc(uid);
  // Cheap check first: nearly every call is for an account that already has a wallet.
  const existing = await walletRef.get();
  if (existing.exists && (existing.data()?.trialGrantedAt || existing.data()?.trialChecked)) return 0;

  const user = await adminAuth.getUser(uid).catch(() => null);
  if (!user?.email || !user.emailVerified) return 0;

  const grantRef = db.collection("trialGrants").doc(trialKey(user.email));
  const statsRef = db.collection("billingStats").doc("trials");
  return db.runTransaction(async (tx) => {
    const [grant, stats, wallet] = await Promise.all([tx.get(grantRef), tx.get(statsRef), tx.get(walletRef)]);
    const w = wallet.data() ?? {};
    if (w.trialGrantedAt || w.trialChecked) return 0;
    const given = Number(stats.data()?.count ?? 0);
    if (grant.exists || given >= trialLimit()) {
      // Remember the answer so this account isn't checked again on every page load.
      tx.set(walletRef, { trialChecked: true }, { merge: true });
      return 0;
    }
    const balanceMicros = Number(w.balanceMicros ?? 0) + amount;
    tx.set(grantRef, { uid, amountMicros: amount, at: FieldValue.serverTimestamp() });
    tx.set(statsRef, { count: given + 1, totalMicros: FieldValue.increment(amount) }, { merge: true });
    tx.set(walletRef, { balanceMicros, heldMicros: Number(w.heldMicros ?? 0), trialGrantedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    tx.set(walletRef.collection("ledger").doc(), { type: "trial", amountMicros: amount, balanceAfterMicros: balanceMicros, at: FieldValue.serverTimestamp() });
    return amount;
  });
}
