import { S3Client } from "@aws-sdk/client-s3";

// Shared MinIO/S3 client — was previously duplicated with a hardcoded
// `tls: true` across upload/download/delete routes and pdfGenerate.ts,
// which would silently break the moment MINIO_ENDPOINT ever pointed at a
// plain-HTTP LAN address (as it now does for the deployed instance — the
// app and MinIO both run on the same box, so this is a same-machine call
// with no reason to route through the public HTTPS tunnel at all). TLS is
// derived from the endpoint's own protocol instead of hardcoded, so this
// keeps working correctly whether MINIO_ENDPOINT is a LAN http:// address
// or a public https:// one.
export function getMinioClient(): S3Client {
  const endpoint = process.env.MINIO_ENDPOINT;
  return new S3Client({
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: process.env.MINIO_ACCESS_KEY!,
      secretAccessKey: process.env.MINIO_SECRET_KEY!,
    },
    forcePathStyle: true, // required for MinIO
    tls: endpoint?.startsWith("https://") ?? true,
  });
}
