// Cash and credit totals over wallet ledger entries, for the admin AI dashboard. No Firebase here.
// Ledger types: "purchase" (wallet.ts creditPurchase), "refund" / "dispute" (reverseCredit),
// "trial" (trial.ts grantTrialIfEligible), "refund-ai" (refundFailedWork), "charge" (AI usage; not money in or out).

export type LedgerEntry = {
  type: string; amountMicros: number; paidMicros?: number | null; at: Date;
};

export type MoneySummary = {
  /** Sum of paidMicros on "purchase": what Stripe took from students. */
  cashCollectedMicros: number;
  /** Sum of amountMicros on "purchase": the credit those payments bought. */
  creditGrantedMicros: number;
  /** "refund" + "dispute", reported positive (they are stored negative). */
  cashRefundedMicros: number;
  /** Collected less refunded. */
  netCashMicros: number;
  /** "trial": free credit we gave away. */
  trialGrantedMicros: number;
  /** "refund-ai": credit handed back for failed work, our loss, since the provider still billed us. */
  creditRefundedMicros: number;
};

export function summarizeLedger(entries: LedgerEntry[]): MoneySummary {
  let cashCollectedMicros = 0, creditGrantedMicros = 0, cashRefundedMicros = 0, trialGrantedMicros = 0, creditRefundedMicros = 0;
  for (const entry of entries) {
    switch (entry.type) {
      case "purchase":
        // A legacy purchase with no paidMicros is zero cash, not its credit figure: that would inflate revenue.
        cashCollectedMicros += entry.paidMicros ?? 0;
        creditGrantedMicros += entry.amountMicros;
        break;
      case "refund":
      case "dispute":
        cashRefundedMicros -= entry.amountMicros;
        break;
      case "trial":
        trialGrantedMicros += entry.amountMicros;
        break;
      case "refund-ai":
        creditRefundedMicros += entry.amountMicros;
        break;
    }
  }
  return {
    cashCollectedMicros, creditGrantedMicros, cashRefundedMicros,
    netCashMicros: cashCollectedMicros - cashRefundedMicros,
    trialGrantedMicros, creditRefundedMicros,
  };
}

/** What students paid less what the provider billed us. Both sums must already leave out costSource "unknown" rows. */
export function marginMicros(chargeMicros: number, costMicros: number): number {
  return chargeMicros - costMicros;
}
