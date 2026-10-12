import { createHash } from "node:crypto";
import JSZip from "jszip";
import { GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import type { DocumentSnapshot, Firestore } from "firebase-admin/firestore";
import type { UserRecord } from "firebase-admin/auth";
import { getMinioClient } from "@/src/library/minioClient";
import { listChunksForUser } from "@/src/library/vectorStore";
import { encodeAccountExportValue, objectArchivePath } from "./accountDataExportFormat";

const MINIO_BUCKET = "studora";
const DEFAULT_MAX_EXPORT_BYTES = 100 * 1024 * 1024;

/** Keep the complete export as the production default. Setting this to false
 * is a temporary, visibly incomplete mode for environments where Firebase
 * Admin/Firestore is unavailable but MinIO and Qdrant need validation. */
export function shouldIncludeFirebaseData(value = process.env.ACCOUNT_DATA_EXPORT_INCLUDE_FIREBASE): boolean {
  return value?.trim().toLowerCase() !== "false";
}

export class AccountDataExportError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
    cause?: unknown
  ) {
    super(publicMessage, { cause });
    this.name = "AccountDataExportError";
  }
}

function serviceStatus(error: unknown): number | null {
  if (!error || typeof error !== "object" || !("$metadata" in error)) return null;
  const metadata = (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata;
  return typeof metadata?.httpStatusCode === "number" ? metadata.httpStatusCode : null;
}

function firebaseExportError(error: unknown): AccountDataExportError {
  if (error instanceof AccountDataExportError) return error;
  return new AccountDataExportError(503, "Catalyst account data (Firebase) is unavailable. Please try again later.", error);
}

function qdrantExportError(error: unknown): AccountDataExportError {
  if (error instanceof AccountDataExportError) return error;
  return new AccountDataExportError(503, "Catalyst indexed context (Qdrant) is unavailable. Please try again later.", error);
}

function minioExportError(error: unknown): AccountDataExportError {
  if (error instanceof AccountDataExportError) return error;
  const status = serviceStatus(error);
  if (status === 401 || status === 403) {
    return new AccountDataExportError(503, "Catalyst file storage (MinIO) access is unavailable. Please try again later.", error);
  }
  if (status === 404) {
    return new AccountDataExportError(503, "Catalyst file storage (MinIO) bucket is unavailable. Please try again later.", error);
  }
  return new AccountDataExportError(503, "Catalyst file storage (MinIO) is unavailable. Please try again later.", error);
}

type ExportedDocument = {
  id: string;
  fields: unknown;
  subcollections: Record<string, ExportedDocument[]>;
};

type ExportedFile = {
  archivePath: string;
  objectKey: string;
  contentType: string | null;
  bytes: number;
  sha256: string;
  lastModified: string | null;
  etag: string | null;
};

function exportByteLimit(): number {
  const configured = Number(process.env.ACCOUNT_DATA_EXPORT_MAX_BYTES);
  return Number.isSafeInteger(configured) && configured > 0 ? configured : DEFAULT_MAX_EXPORT_BYTES;
}

async function exportDocument(snapshot: DocumentSnapshot): Promise<ExportedDocument> {
  const subcollections: Record<string, ExportedDocument[]> = {};
  const collections = await snapshot.ref.listCollections();
  for (const collection of collections) {
    const documents = await collection.get();
    subcollections[collection.id] = await Promise.all(documents.docs.map(exportDocument));
  }

  return {
    id: snapshot.id,
    fields: encodeAccountExportValue(snapshot.data() ?? {}),
    subcollections,
  };
}

function exportAuthUser(user: UserRecord): Record<string, unknown> {
  return encodeAccountExportValue({
    uid: user.uid,
    email: user.email ?? null,
    emailVerified: user.emailVerified,
    displayName: user.displayName ?? null,
    phoneNumber: user.phoneNumber ?? null,
    photoURL: user.photoURL ?? null,
    disabled: user.disabled,
    providerData: user.providerData.map((provider) => ({
      providerId: provider.providerId,
      uid: provider.uid,
      displayName: provider.displayName ?? null,
      email: provider.email ?? null,
      phoneNumber: provider.phoneNumber ?? null,
      photoURL: provider.photoURL ?? null,
    })),
    metadata: {
      creationTime: user.metadata.creationTime ?? null,
      lastSignInTime: user.metadata.lastSignInTime ?? null,
      lastRefreshTime: user.metadata.lastRefreshTime ?? null,
    },
  }) as Record<string, unknown>;
}

async function userOwnedGlobalRecords(db: Firestore, uid: string): Promise<Record<string, unknown>> {
  const byUserId = ["documentProcessingJobs", "advisingExtractionJobs", "advisingScheduleJobs"];
  const records: Record<string, unknown> = {};

  for (const collection of byUserId) {
    const snapshot = await db.collection(collection).where("userId", "==", uid).get();
    records[collection] = await Promise.all(snapshot.docs.map(exportDocument));
  }

  const shares = await db.collection("publicNoteShares").where("ownerUid", "==", uid).get();
  records.publicNoteShares = await Promise.all(shares.docs.map(exportDocument));

  const mappings = await db.collectionGroup("ownerMapping").where("ownerUid", "==", uid).get();
  const publicStudySets: ExportedDocument[] = [];
  for (const mapping of mappings.docs) {
    const parent = mapping.ref.parent.parent;
    if (!parent || parent.parent.id !== "publicStudySets") continue;
    const studySet = await parent.get();
    if (studySet.exists) publicStudySets.push(await exportDocument(studySet));
  }
  records.publicStudySets = publicStudySets;
  return records;
}

async function listUserObjects(uid: string): Promise<Array<{ key: string; size: number; lastModified: Date | null; etag: string | null }>> {
  const client = await getMinioClient();
  const prefix = `users/${uid}/`;
  const objects: Array<{ key: string; size: number; lastModified: Date | null; etag: string | null }> = [];
  let continuationToken: string | undefined;

  do {
    const page = await client.send(new ListObjectsV2Command({
      Bucket: MINIO_BUCKET,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    }));
    for (const item of page.Contents ?? []) {
      if (item.Key?.startsWith(prefix)) {
        objects.push({
          key: item.Key,
          size: item.Size ?? 0,
          lastModified: item.LastModified ?? null,
          etag: item.ETag ?? null,
        });
      }
    }
    continuationToken = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (continuationToken);

  return objects;
}

async function addUserFiles(zip: JSZip, uid: string): Promise<ExportedFile[]> {
  const client = await getMinioClient();
  const objects = await listUserObjects(uid);
  const files: ExportedFile[] = [];
  let totalBytes = 0;
  const maxBytes = exportByteLimit();

  for (const [index, object] of objects.entries()) {
    if (totalBytes + object.size > maxBytes) {
      throw new AccountDataExportError(
        413,
        "Your stored files exceed the current export size limit. Please contact support for a large-data export."
      );
    }
    const response = await client.send(new GetObjectCommand({ Bucket: MINIO_BUCKET, Key: object.key }));
    if (!response.Body) throw new Error("MinIO returned an unreadable object.");
    const bytes = Buffer.from(await response.Body.transformToByteArray());
    if (totalBytes + bytes.length > maxBytes) {
      throw new AccountDataExportError(
        413,
        "Your stored files exceed the current export size limit. Please contact support for a large-data export."
      );
    }

    const archivePath = objectArchivePath(index + 1, object.key);
    zip.file(archivePath, bytes, { binary: true, compression: "STORE" });
    totalBytes += bytes.length;
    files.push({
      archivePath,
      objectKey: object.key,
      contentType: response.ContentType ?? null,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      lastModified: object.lastModified?.toISOString() ?? null,
      etag: object.etag,
    });
  }
  return files;
}

type FirebaseExport = {
  authUser: UserRecord;
  privateTree: ExportedDocument | null;
  globalRecords: Record<string, unknown>;
};

async function exportFirebaseData(uid: string): Promise<FirebaseExport> {
  // This import is intentionally deferred. Temporary non-Firebase exports
  // must not initialize the Admin SDK or parse Admin credentials at all.
  const { adminAuth, adminDb } = await import("@/src/library/firebaseAdmin");
  const authUser = await adminAuth.getUser(uid).catch((error: unknown) => {
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "auth/user-not-found") {
      throw new AccountDataExportError(404, "This Catalyst account no longer exists.");
    }
    throw firebaseExportError(error);
  });
  const [userSnapshot, globalRecords] = await Promise.all([
    adminDb.doc(`users/${uid}`).get().catch((error: unknown) => { throw firebaseExportError(error); }),
    userOwnedGlobalRecords(adminDb, uid).catch((error: unknown) => { throw firebaseExportError(error); }),
  ]);
  const privateTree = userSnapshot.exists
    ? await exportDocument(userSnapshot).catch((error: unknown) => { throw firebaseExportError(error); })
    : null;
  return { authUser, privateTree, globalRecords };
}

/** Builds a one-time, owner-authorized ZIP export. Large durable exports are
 * intentionally rejected rather than silently omitting files; the planned
 * queued export worker can replace this bounded endpoint without weakening
 * the archive format or its ownership checks. */
export async function buildAccountDataExport(uid: string): Promise<Buffer> {
  const zip = new JSZip();
  const includeFirebase = shouldIncludeFirebaseData();
  const [firebaseData, indexedContext] = await Promise.all([
    includeFirebase ? exportFirebaseData(uid) : Promise.resolve(null),
    listChunksForUser(uid).catch((error: unknown) => { throw qdrantExportError(error); }),
  ]);

  const files = await addUserFiles(zip, uid).catch((error: unknown) => { throw minioExportError(error); });
  const generatedAt = new Date().toISOString();

  if (firebaseData) {
    zip.file("account.json", JSON.stringify(exportAuthUser(firebaseData.authUser), null, 2));
    zip.file("firestore.json", JSON.stringify({ root: firebaseData.privateTree }, null, 2));
    zip.file("global-records.json", JSON.stringify(encodeAccountExportValue(firebaseData.globalRecords), null, 2));
  }
  zip.file("indexed-context.jsonl", indexedContext.map((point) => JSON.stringify(encodeAccountExportValue(point))).join("\n"));
  zip.file("README.md", [
    "# Catalyst data export",
    "",
    firebaseData
      ? "This archive contains your private Catalyst account records, original uploaded files, and derived indexed context."
      : "This temporary archive contains original uploaded files and derived indexed context only.",
    "It excludes credentials, OAuth tokens, password hashes, one-time login challenges, and server secrets.",
    ...(firebaseData ? [] : ["Additional account records were not included in this temporary export."]),
    "The files/objects paths are safe archive names; their original MinIO keys are recorded in manifest.json.",
    "A future Catalyst restore imports this data into a newly authenticated account and rebuilds document indexing.",
    "",
  ].join("\n"));
  zip.file("manifest.json", JSON.stringify({
    schemaVersion: 1,
    generatedAt,
    uid,
    includedServices: {
      accountRecords: Boolean(firebaseData),
      minio: true,
      qdrant: true,
    },
    files,
    counts: {
      objectFiles: files.length,
      indexedContextRecords: indexedContext.length,
      publicNoteShares: firebaseData && Array.isArray(firebaseData.globalRecords.publicNoteShares)
        ? firebaseData.globalRecords.publicNoteShares.length
        : 0,
      publicStudySets: firebaseData && Array.isArray(firebaseData.globalRecords.publicStudySets)
        ? firebaseData.globalRecords.publicStudySets.length
        : 0,
    },
  }, null, 2));

  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
}
