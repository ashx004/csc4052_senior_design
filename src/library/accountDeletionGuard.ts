import { adminDb } from "@/src/library/firebaseAdmin";

/** A server-only tombstone. Firestore rules consult it before allowing a
 * client to write the user's private tree, so deletion cannot race a stale
 * browser tab recreating records while the purge is running. */
export const ACCOUNT_DELETION_GUARDS = "accountDeletionGuards";

export async function isAccountDeletionInProgress(uid: string): Promise<boolean> {
  const snapshot = await adminDb.collection(ACCOUNT_DELETION_GUARDS).doc(uid).get();
  return snapshot.exists;
}

export async function assertAccountIsActive(uid: string): Promise<void> {
  if (await isAccountDeletionInProgress(uid)) {
    throw new Error("This account is being deleted.");
  }
}
