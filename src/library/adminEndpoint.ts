import "server-only";
import { NextRequest } from "next/server";
import { AdminAccessError, requireAdmin } from "./adminAuth";
import { ReportError } from "./analyticsReportContract";
import { isFirestoreQuotaError } from "./firestoreQuota";
import { checkRateLimit } from "./rateLimit";
import { SESSION_COOKIE } from "./requestAuthToken";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};

const QUOTA_MESSAGE =
  "Live monitoring data is unavailable: the daily Firestore read quota is used up. It resets at midnight Pacific.";

export async function adminEndpoint(
  request: NextRequest,
  name: string,
  load: () => Promise<unknown>,
) {
  try {
    const admin = await requireAdmin({
      cookie: request.cookies.get(SESSION_COOKIE)?.value,
      authorization: request.headers.get("authorization"),
    });
    const limit = checkRateLimit(`${name}:${admin.uid}`, 60_000, 15);
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: {
            ...headers,
            "Retry-After": String(limit.retryAfterSeconds ?? 60),
          },
        },
      );
    }
    return Response.json(await load(), { headers });
  } catch (error) {
    const known =
      error instanceof AdminAccessError || error instanceof ReportError;
    return Response.json(
      {
        error: known
          ? error.message
          : isFirestoreQuotaError(error)
            ? QUOTA_MESSAGE
            : "Monitoring is temporarily unavailable.",
      },
      {
        status: known ? error.status : 503,
        headers,
      },
    );
  }
}
