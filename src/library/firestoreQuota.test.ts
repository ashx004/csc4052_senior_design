import { expect, it } from "vitest";
import { isFirestoreQuotaError } from "./firestoreQuota";

it("recognises gRPC code 8", () => {
  expect(isFirestoreQuotaError(Object.assign(new Error("Quota exceeded."), { code: 8 }))).toBe(true);
  expect(isFirestoreQuotaError({ code: 8 })).toBe(true);
});
it("recognises RESOURCE_EXHAUSTED in the message", () => {
  expect(isFirestoreQuotaError(new Error("8 RESOURCE_EXHAUSTED: Quota exceeded."))).toBe(true);
  expect(isFirestoreQuotaError({ message: "RESOURCE_EXHAUSTED" })).toBe(true);
});
it("rejects an unrelated error", () => {
  expect(isFirestoreQuotaError(Object.assign(new Error("14 UNAVAILABLE: No connection"), { code: 14 }))).toBe(false);
  expect(isFirestoreQuotaError({ code: "8", message: 8 })).toBe(false);
});
it("rejects non-objects without throwing", () => {
  for (const value of [null, undefined, "RESOURCE_EXHAUSTED", 8, true]) {
    expect(isFirestoreQuotaError(value), String(value)).toBe(false);
  }
});
