import { S3Client } from "@aws-sdk/client-s3";
import { probeUrl, resolveReachableUrl } from "./resolveReachableUrl";

// Resolves which MinIO endpoint a call should actually use: LAN-direct when
// reachable, falling back to the public tunneled URL (MINIO_ENDPOINT_FALLBACK)
// for callers off the home/school LAN (e.g. a teammate developing remotely).
async function resolveMinioEndpoint(): Promise<string> {
  const endpoint = process.env.MINIO_ENDPOINT!;
  const fallbackEndpoint = process.env.MINIO_ENDPOINT_FALLBACK;
  return resolveReachableUrl(endpoint, fallbackEndpoint, (url) => probeUrl(url, "/minio/health/live"));
}

// Shared MinIO/S3 client — was previously duplicated with a hardcoded
// `tls: true` across upload/download/delete routes and pdfGenerate.ts,
// which would silently break the moment MINIO_ENDPOINT ever pointed at a
// plain-HTTP LAN address (as it now does for the deployed instance — the
// app and MinIO both run on the same box, so this is a same-machine call
// with no reason to route through the public HTTPS tunnel at all). TLS is
// derived from the endpoint's own protocol instead of hardcoded, so this
// keeps working correctly whether MINIO_ENDPOINT is a LAN http:// address
// or a public https:// one.

export async function getMinioClient(): Promise<S3Client> {
  const endpoint = await resolveMinioEndpoint();
  return new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true, // required for MinIO
    tls: endpoint.startsWith("https://"),
  });
}