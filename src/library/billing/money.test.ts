import { describe, expect, it } from "vitest";
import { creditForPayment, formatUsd, tokenCostMicros, usdToMicros } from "./money";

describe("billing money", () => {
  it("passes Stripe's 2.9% + $0.30 to the payer", () => {
    expect(creditForPayment(usdToMicros(10))).toBe(usdToMicros(9.41));
    expect(creditForPayment(usdToMicros(5))).toBe(usdToMicros(4.555));
    expect(creditForPayment(usdToMicros(0.2))).toBe(0);
  });

  it("charges tokens at USD-per-million rates, rounded up", () => {
    // 1,000 input at $0.06/M + 500 output at $0.40/M = $0.00026
    expect(tokenCostMicros(1000, 500, { inputPerM: 0.06, outputPerM: 0.4 })).toBe(260);
    expect(tokenCostMicros(1, 0, { inputPerM: 0.05, outputPerM: 0 })).toBe(1);
  });

  it("formats sub-cent amounts instead of $0.00", () => {
    expect(formatUsd(260)).toBe("$0.0003");
    expect(formatUsd(usdToMicros(9.41))).toBe("$9.41");
  });
});
