import { describe, expect, it } from "vitest";
import { allocateConceptQuotas, type ConceptDemand } from "./allocateConceptQuotas";

const demand = (conceptKey: string, missCount: number): ConceptDemand => ({
  conceptKey,
  label: conceptKey,
  missCount,
});

describe("allocateConceptQuotas", () => {
  it("splits roughly by miss count", () => {
    const { quotas } = allocateConceptQuotas(
      [demand("chain rule", 3), demand("product rule", 1)], 12, 12,
    );
    const chain = quotas.find((q) => q.conceptKey === "chain rule")!.items;
    const product = quotas.find((q) => q.conceptKey === "product rule")!.items;
    expect(chain).toBeGreaterThan(product);
    expect(chain + product).toBe(12);
  });

  it("gives every included concept at least three items so each can retire", () => {
    const { quotas } = allocateConceptQuotas(
      [demand("chain rule", 9), demand("product rule", 1)], 10, 10,
    );
    for (const quota of quotas) expect(quota.items).toBeGreaterThanOrEqual(3);
  });

  it("grows the count up to the cap when the requested count cannot give everyone three", () => {
    const { totalItems } = allocateConceptQuotas(
      [demand("a", 1), demand("b", 1), demand("c", 1)], 6, 12,
    );
    expect(totalItems).toBeGreaterThanOrEqual(9);
    expect(totalItems).toBeLessThanOrEqual(12);
  });

  it("defers the weakest-evidence concepts when the cap cannot fit them all", () => {
    const { quotas, deferred } = allocateConceptQuotas(
      [demand("a", 5), demand("b", 4), demand("c", 1)], 8, 8,
    );
    expect(quotas).toHaveLength(2);
    expect(deferred.map((d) => d.conceptKey)).toEqual(["c"]);
  });

  it("never emits a concept with one or two items", () => {
    const { quotas } = allocateConceptQuotas(
      [demand("a", 7), demand("b", 1)], 8, 8,
    );
    for (const quota of quotas) expect(quota.items).toBeGreaterThanOrEqual(3);
  });

  it("returns a single concept taking the whole count", () => {
    const { quotas, totalItems } = allocateConceptQuotas([demand("a", 4)], 10, 10);
    expect(quotas).toEqual([{ conceptKey: "a", label: "a", items: 10 }]);
    expect(totalItems).toBe(10);
  });

  it("returns empty results for an empty concept list without throwing", () => {
    expect(allocateConceptQuotas([], 10, 12)).toEqual({
      quotas: [],
      deferred: [],
      totalItems: 0,
    });
  });
});
