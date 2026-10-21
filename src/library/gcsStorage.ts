import { observeOperation } from "./monitoring/telemetry";
import { Storage, type Bucket } from "@google-cloud/storage";

// Shared Google Cloud Storage access for every file the app stores. Replaces
// the old MinIO/S3 client; callers use these helpers instead of S3 commands.
// GCS_SERVICE_ACCOUNT_JSON holds the service account key as one line of JSON
// and GCS_BUCKET names the bucket.

let cachedBucket: Bucket | undefined;

export function getBucket(): Bucket {
  if (cachedBucket) return cachedBucket;
  const raw = process.env.GCS_SERVICE_ACCOUNT_JSON;
  const bucketName = process.env.GCS_BUCKET;
  if (!raw || !bucketName) {
    throw new Error("Google Cloud Storage is not configured (GCS_SERVICE_ACCOUNT_JSON and GCS_BUCKET).");
  }
  const credentials = JSON.parse(raw);
  cachedBucket = new Storage({ projectId: credentials.project_id, credentials }).bucket(bucketName);
  return cachedBucket;
}

export type StoredObjectInfo = { key: string; size: number; lastModified: Date | null; etag: string | null };

export async function putObject(key: string, body: Buffer | string, contentType?: string): Promise<void> {
  await observeOperation("storage", () => getBucket().file(key).save(body, { contentType, resumable: false }));
}

export async function getObject(key: string): Promise<{ body: Buffer; contentType: string | null }> {
  const file = getBucket().file(key);
  const [[body], [metadata]] = await observeOperation("storage", () => Promise.all([file.download(), file.getMetadata()]));
  return { body, contentType: metadata.contentType ?? null };
}

export async function deleteObject(key: string): Promise<void> {
  await observeOperation("storage", () => getBucket().file(key).delete({ ignoreNotFound: true }));
}

/** Metadata for one object, or null when it does not exist. */
export async function headObject(key: string): Promise<StoredObjectInfo | null> {
  const file = getBucket().file(key);
  const [exists] = await observeOperation("storage", () => file.exists());
  if (!exists) return null;
  const [metadata] = await observeOperation("storage", () => file.getMetadata());
  return toInfo(key, metadata);
}

export async function listObjects(prefix: string): Promise<StoredObjectInfo[]> {
  const [files] = await observeOperation("storage", () => getBucket().getFiles({ prefix, autoPaginate: true }));
  return files.map((file) => toInfo(file.name, file.metadata));
}

function toInfo(key: string, metadata: { size?: string | number; updated?: string; etag?: string }): StoredObjectInfo {
  return {
    key,
    size: Number(metadata.size ?? 0),
    lastModified: metadata.updated ? new Date(metadata.updated) : null,
    etag: metadata.etag ?? null,
  };
}
