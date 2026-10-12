import { describe, expect, it } from "vitest";
import { ACCOUNT_DELETION_CONFIRMATION, hasValidDeletionConsent } from "./accountDeletionConsent";

describe("account deletion consent", () => {
  it("requires the exact typed phrase and explicit acknowledgement", () => {
    expect(hasValidDeletionConsent({
      confirmation: ACCOUNT_DELETION_CONFIRMATION,
      acknowledged: true,
    })).toBe(true);
    expect(hasValidDeletionConsent({ confirmation: "delete my account", acknowledged: true })).toBe(false);
    expect(hasValidDeletionConsent({ confirmation: ACCOUNT_DELETION_CONFIRMATION, acknowledged: false })).toBe(false);
  });
});
