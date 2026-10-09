import { checkRateLimit } from "@/src/library/rateLimit";
import { NextRequest } from "next/server";
import { AdminAccessError, requireAdmin } from "@/src/library/adminAuth";
import { ReportError } from "@/src/library/analyticsReportContract";
import { SESSION_COOKIE } from "@/src/library/requestAuthToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIVATE_RESPONSE_HEADERS = {
  "Cache-Control": "private, no-store",
  Vary: "Cookie, Authorization",
};
const ALLOWED_QUERY_PARAMETERS = ["start", "end"];

export async function GET(request: NextRequest) {
  try {
    // Authorization must happen before accessing the reporting service's cache.
    const admin = await requireAdmin({
      cookie: request.cookies.get(SESSION_COOKIE)?.value,
      authorization: request.headers.get("authorization"),
    });

    const limit = checkRateLimit(`analytics:${admin.uid}`, 60_000, 30);
    if (!limit.allowed) {
      return Response.json(
        { error: "Too many report requests. Please try again shortly." },
        {
          status: 429,
          headers: {
            ...PRIVATE_RESPONSE_HEADERS,
            "Retry-After": String(limit.retryAfterSeconds ?? 60),
          },
        },
      );
    }

    const parameters = request.nextUrl.searchParams;
    for (const parameterName of parameters.keys()) {
      if (
        !ALLOWED_QUERY_PARAMETERS.includes(parameterName) ||
        parameters.getAll(parameterName).length !== 1
      ) {
        throw new ReportError(
          400,
          "Provide each start and end date at most once. No other filters are accepted.",
        );
      }
    }

    const startDate = parameters.get("start") ?? "7days";
    const endDate = parameters.get("end") ?? "";
    const { getAnalyticsReport } =
      await import("@/src/library/analyticsReports");
    const report = await getAnalyticsReport(startDate, endDate);

    return Response.json(report, { headers: PRIVATE_RESPONSE_HEADERS });
  } catch (error) {
    let message = "Reporting is temporarily unavailable.";
    let status = 503;
    if (error instanceof AdminAccessError || error instanceof ReportError) {
      message = error.message;
      status = error.status;
    }

    return Response.json(
      { error: message },
      { status, headers: PRIVATE_RESPONSE_HEADERS },
    );
  }
}
