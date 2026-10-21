import "server-only";
import { NextRequest } from "next/server";
import { AdminAccessError, requireAdmin } from "./adminAuth";
import { ReportError } from "./analyticsReportContract";
import { checkRateLimit } from "./rateLimit";
import { SESSION_COOKIE } from "./requestAuthToken";

const headers = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};

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
        error: known ? error.message : "Monitoring is temporarily unavailable.",
      },
      {
        status: known ? error.status : 503,
        headers,
      },
    );
  }
}
