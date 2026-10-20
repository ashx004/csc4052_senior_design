import { NextRequest } from "next/server";
import { AdminAccessError, requireAdmin } from "@/src/library/adminAuth";
import { TEST_ERROR_MESSAGE } from "@/src/library/monitoring/alertRules";
import { SESSION_COOKIE } from "@/src/library/requestAuthToken";

// "Test the alerts": an administrator opens /api/admin/monitoring/test-error and
// this route throws on purpose. The error goes through the same path a real
// crash does (instrumentation.ts onRequestError -> errorReporter), and
// alertRules always emails for this message, so the test can be repeated.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin({
      cookie: request.cookies.get(SESSION_COOKIE)?.value,
      authorization: request.headers.get("authorization"),
    });
  } catch (error) {
    const status = error instanceof AdminAccessError ? error.status : 503;
    const message = error instanceof AdminAccessError ? error.message : "Administrator verification is unavailable.";
    return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }

  throw new Error(TEST_ERROR_MESSAGE);
}
