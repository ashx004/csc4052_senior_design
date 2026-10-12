import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/src/library/firebaseAdmin";
import { getMinioClient } from "@/src/library/minioClient";
import { deleteChunksForUser } from "@/src/library/vectorStore";
import { ACCOUNT_DELETION_GUARDS } from "@/src/library/accountDeletionGuard";

const MINIO_BUCKET = "studora";

export class AccountDeletionError extends Error {
  constructor(
    public readonly publicMessage: string,
    public readonly category: "Firebase" | "MinIO" | "Qdrant" | "unknown",
    public readonly phase: string,
    public readonly errorCode: string,
    cause?: unknown
  ) {
    super(publicMessage, { cause });
    this.name = "AccountDeletionError";
  }
}

function safeErrorCode(error: unknown): string {
  if (!error || typeof error !== "object" || !("code" in error)) return "unknown";
  const code = String((error as { code?: unknown }).code);
  return /^[a-z0-9_.-]{1,80}$/i.test(code) ? code : "unknown";
}

function deletionFailure(phase: string, cause: unknown): AccountDeletionError {
  const errorCode = safeErrorCode(cause);
  if (phase === "indexed-context") {
    return new AccountDeletionError(
      "Catalyst indexed context (Qdrant) is unavailable. Your account is protected from new writes; please try again later.",
      "Qdrant",
      phase,
      errorCode,
      cause
    );
  }
  if (phase === "stored-files") {
    return new AccountDeletionError(
      "Catalyst file storage (MinIO) is unavailable. Your account is protected from new writes; please try again later.",
      "MinIO",
      phase,
      errorCode,
      cause
    );
  }
  if (["preparing", "application-records", "private-records", "authentication"].includes(phase)) {
    return new AccountDeletionError(
      "Catalyst account data is unavailable. Your account is protected from new writes; please try again later.",
      "Firebase",
      phase,
      errorCode,
      cause
    );
  }
  return new AccountDeletionError(
    "Unable to complete account deletion right now. Your account data is protected from new writes; please try again later.",
    "unknown",
    phase,
    errorCode,
    cause
  );
}

function isNotFound(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && String(error.code) === "auth/user-not-found");
}

async function setPhase(uid: string, phase: string, extra: Record<string, unknown> = {}): Promise<void> {
  await adminDb.collection(ACCOUNT_DELETION_GUARDS).doc(uid).set({
    status: "in-progress",
    phase,
    updatedAt: new Date(),
    ...extra,
  }, { merge: true });
}

async function deleteMinioObjects(uid: string): Promise<void> {
  const client = await getMinioClient();
  const prefix = `users/${uid}/`;
  let continuationToken: string | undefined;

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: MINIO_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    const objects = (page.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key?.startsWith(prefix)))
      .map((Key) => ({ Key }));
    if (objects.length > 0) {
      const result = await client.send(new DeleteObjectsCommand({
        Bucket: MINIO_BUCKET,
        Delete: { Objects: objects, Quiet: true },
      }));
      if ((result.Errors?.length ?? 0) > 0) {
        throw new Error("MinIO refused to delete one or more account objects.");
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  const remaining = await client.send(new ListObjectsV2Command({ Bucket: MINIO_BUCKET, Prefix: prefix, MaxKeys: 1 }));
  if ((remaining.Contents?.length ?? 0) > 0) {
    throw new Error("MinIO account deletion verification found remaining objects.");
  }
}

async function deleteDocuments(db: Firestore, documents: QueryDocumentSnapshot[]): Promise<void> {
  for (const document of documents) {
    await db.recursiveDelete(document.ref);
  }
}

async function deleteGlobalRecords(uid: string): Promise<void> {
  const perUserCollections = ["documentProcessingJobs", "advisingExtractionJobs", "advisingScheduleJobs"];
  for (const collection of perUserCollections) {
    const snapshot = await adminDb.collection(collection).where("userId", "==", uid).get();
    await deleteDocuments(adminDb, snapshot.docs);
  }

  const challenges = await adminDb.collection("authLoginChallenges").where("uid", "==", uid).get();
  await deleteDocuments(adminDb, challenges.docs);

  const shares = await adminDb.collection("publicNoteShares").where("ownerUid", "==", uid).get();
  await deleteDocuments(adminDb, shares.docs);

  const mappings = await adminDb.collectionGroup("ownerMapping").where("ownerUid", "==", uid).get();
  const publicSetPaths = new Set<string>();
  for (const mapping of mappings.docs) {
    const parent = mapping.ref.parent.parent;
    if (parent?.parent.id === "publicStudySets") publicSetPaths.add(parent.path);
  }
  for (const path of publicSetPaths) {
    await adminDb.recursiveDelete(adminDb.doc(path));
  }

  await adminDb.doc(`authLoginChallengeState/${uid}`).delete();
}

/** OAuth tokens are credentials, not retained user data. Revocation is
 * best-effort: a Google outage must not leave the rest of an account purge
 * incomplete, and deleting the local token still removes Catalyst access. */
async function revokeCalendarAccess(rootData: Record<string, unknown> | undefined): Promise<void> {
  const calendarTokens = rootData?.calendarTokens;
  if (!calendarTokens || typeof calendarTokens !== "object") return;
  const tokens = calendarTokens as Record<string, unknown>;
  const token = typeof tokens.refresh_token === "string"
    ? tokens.refresh_token
    : typeof tokens.access_token === "string" ? tokens.access_token : null;
  if (!token) return;
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => undefined);
}

/**
 * Permanently deletes an authenticated user's Catalyst data. The guard is
 * written before any purge step and deliberately retained after completion:
 * it blocks stale Firebase ID tokens from recreating the private tree while
 * they naturally expire. It contains no profile/content data.
 */
export async function deleteAccountData(uid: string): Promise<void> {
  const guardRef = adminDb.collection(ACCOUNT_DELETION_GUARDS).doc(uid);
  const rootRef = adminDb.doc(`users/${uid}`);
  let phase = "preparing";

  try {
    await guardRef.set({
      status: "in-progress",
      phase: "preparing",
      requestedAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    // Revoke long-lived sessions first. The current request has already been
    // recently authenticated and is allowed to finish its own purge.
    await adminAuth.revokeRefreshTokens(uid);
    const root = await rootRef.get();
    await revokeCalendarAccess(root.data());

    phase = "indexed-context";
    await setPhase(uid, phase);
    await deleteChunksForUser(uid);

    phase = "stored-files";
    await setPhase(uid, phase);
    await deleteMinioObjects(uid);

    phase = "application-records";
    await setPhase(uid, phase);
    await deleteGlobalRecords(uid);

    phase = "private-records";
    await setPhase(uid, phase);
    await adminDb.recursiveDelete(rootRef);

    phase = "authentication";
    await setPhase(uid, phase);
    await adminAuth.deleteUser(uid).catch((error: unknown) => {
      if (!isNotFound(error)) throw error;
    });

    await guardRef.set({
      status: "complete",
      phase: "complete",
      completedAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });
  } catch (error) {
    const failure = deletionFailure(phase, error);
    await guardRef.set({
      status: "failed",
      phase: "failed",
      failedPhase: failure.phase,
      failureCategory: failure.category,
      failureCode: failure.errorCode,
      failedAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true }).catch(() => undefined);
    throw failure;
  }
}
