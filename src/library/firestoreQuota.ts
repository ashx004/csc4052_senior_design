/** Firestore's RESOURCE_EXHAUSTED (gRPC code 8), however the client library surfaces it. */
export function isFirestoreQuotaError(err: unknown): boolean {
  const { code, message } = (err ?? {}) as { code?: unknown; message?: unknown };
  return code === 8 || (typeof message === "string" && message.includes("RESOURCE_EXHAUSTED"));
}
