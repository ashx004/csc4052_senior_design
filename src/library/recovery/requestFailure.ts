import type { RecoveryVariant } from "@/src/components/recovery/RecoveryScreen";

/** Error raised for a failed HTTP response after its status is normalized. */
export class RequestFailure extends Error {
  constructor(
    public readonly status: number,
    message = "Request failed"
  ) {
    super(message);
    this.name = "RequestFailure";
  }
}

export type RequestFailureKind = RecoveryVariant | "authorization";

/**
 * Maps transport and HTTP failures to user-facing recovery categories. The
 * original error stays available to callers for diagnostics, never for UI.
 */
export function classifyRequestFailure(error: unknown): RequestFailureKind {
  if (error instanceof RequestFailure) {
    if (error.status === 401 || error.status === 403) return "authorization";
    if (error.status === 404) return "unavailable";
    if (error.status >= 500) return "server";
    return "unexpected";
  }

  if (error instanceof DOMException && error.name === "AbortError") return "network";
  if (error instanceof TypeError) return "network";
  return "unexpected";
}
