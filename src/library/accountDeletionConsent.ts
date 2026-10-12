export const ACCOUNT_DELETION_CONFIRMATION = "DELETE MY ACCOUNT";

export function hasValidDeletionConsent(input: { confirmation?: unknown; acknowledged?: unknown }): boolean {
  return input.confirmation === ACCOUNT_DELETION_CONFIRMATION && input.acknowledged === true;
}
