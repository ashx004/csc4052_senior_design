import { describe, expect, it, vi } from "vitest";

vi.mock("@/src/library/firebaseAdmin", () => ({ adminDb: {} }));
vi.mock("./stripe", () => ({ stripe: () => ({}) }));

import { planRefund } from "./refunds";
import { planReserve, InsufficientCreditError } from "./wallet";

const purchase = (pi: string, creditMicros: number, reversedMicros = 0) => ({ paymentIntentId: pi, creditMicros, reversedMicros, appliedAt: null });

describe("planRefund", () => {
  it("pays back the unused balance from the newest purchases, in whole cents", () => {
    const plan = planRefund(12_345_678, [purchase("pi_new", 9_410_000), purchase("pi_old", 4_555_000)]);
    expect(plan.items).toEqual([{ paymentIntentId: "pi_new", cents: 941 }, { paymentIntentId: "pi_old", cents: 293 }]);
    expect(plan.leftoverMicros).toBe(5_678);
  });

  it("never refunds more than a purchase has left after earlier refunds", () => {
    const plan = planRefund(9_000_000, [purchase("pi_a", 9_410_000, 9_000_000), purchase("pi_b", 4_555_000)]);
    expect(plan.items).toEqual([{ paymentIntentId: "pi_a", cents: 41 }, { paymentIntentId: "pi_b", cents: 455 }]);
    expect(plan.leftoverMicros).toBe(4_040_000);
  });

  it("has nothing to do for an empty or negative balance", () => {
    expect(planRefund(-50, [purchase("pi", 1_000_000)]).items).toEqual([]);
    expect(planRefund(9_999, [purchase("pi", 1_000_000)]).items).toEqual([]);
  });
});

describe("a frozen wallet", () => {
  it("can't start anything new", () => {
    expect(() => planReserve({ balanceMicros: 5_000_000, heldMicros: 0, frozen: true }, 100)).toThrow(InsufficientCreditError);
  });
});
