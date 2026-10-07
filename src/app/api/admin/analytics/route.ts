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
    await requireAdmin({
      cookie: request.cookies.get(SESSION_COOKIE)?.value,
      authorization: request.headers.get("authorization"),
    });

    const parameters = request.nextUrl.searchParams;
    for (const parameterName of parameters.keys()) {
      if (!ALLOWED_QUERY_PARAMETERS.includes(parameterName)) {
        throw new ReportError(400, "Only start and end dates are accepted.");
      }
    }

    const startDate = parameters.get("start") ?? "7days";
    const endDate = parameters.get("end") ?? "";
    const { getAnalyticsReport } = await import(
      "@/src/library/analyticsReports"
    );
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
