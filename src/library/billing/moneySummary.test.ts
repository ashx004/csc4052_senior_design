import { expect, it } from "vitest";
import { marginMicros, summarizeLedger } from "./moneySummary";

it("separates cash collected from credit granted on a purchase", () => {
  const s = summarizeLedger([{ type: "purchase", amountMicros: 9_410_000, paidMicros: 10_000_000, at: new Date() }]);
  expect(s.cashCollectedMicros).toBe(10_000_000);
  expect(s.creditGrantedMicros).toBe(9_410_000);
});

it("counts refunds and disputes as cash out and nets them off", () => {
  const s = summarizeLedger([
    { type: "purchase", amountMicros: 9_410_000, paidMicros: 10_000_000, at: new Date() },
    { type: "refund", amountMicros: -2_000_000, at: new Date() },
    { type: "dispute", amountMicros: -1_000_000, at: new Date() },
  ]);
  expect(s.cashRefundedMicros).toBe(3_000_000);
  expect(s.netCashMicros).toBe(7_000_000);
});

it("treats a purchase with no paidMicros as zero cash, not as its credit amount", () => {
  expect(summarizeLedger([{ type: "purchase", amountMicros: 5_000_000, at: new Date() }]).cashCollectedMicros).toBe(0);
  expect(summarizeLedger([{ type: "purchase", amountMicros: 5_000_000, paidMicros: null, at: new Date() }]).cashCollectedMicros).toBe(0);
});

it("counts trial grants on their own", () => {
  const s = summarizeLedger([{ type: "trial", amountMicros: 1_000_000, at: new Date() }]);
  expect(s).toEqual({
    cashCollectedMicros: 0, creditGrantedMicros: 0, cashRefundedMicros: 0, netCashMicros: 0,
    trialGrantedMicros: 1_000_000, creditRefundedMicros: 0,
  });
});

it("keeps refund-ai out of cash refunded", () => {
  const s = summarizeLedger([
    { type: "purchase", amountMicros: 9_410_000, paidMicros: 10_000_000, at: new Date() },
    { type: "refund-ai", amountMicros: 250_000, at: new Date() },
  ]);
  expect(s.creditRefundedMicros).toBe(250_000);
  expect(s.cashRefundedMicros).toBe(0);
  expect(s.netCashMicros).toBe(10_000_000);
});

it("ignores charge entries entirely", () => {
  const before = [{ type: "purchase", amountMicros: 9_410_000, paidMicros: 10_000_000, at: new Date() }];
  const after = [...before, { type: "charge", amountMicros: -1_500_000, at: new Date() }];
  expect(summarizeLedger(after)).toEqual(summarizeLedger(before));
});

it("is all zeros for no entries", () => {
  expect(Object.values(summarizeLedger([]))).toEqual([0, 0, 0, 0, 0, 0]);
});

it("margin is what the student paid less what the provider billed", () => {
  expect(marginMicros(1055, 1000)).toBe(55);
  expect(marginMicros(0, 0)).toBe(0);
  expect(marginMicros(900, 1000)).toBe(-100);
});
