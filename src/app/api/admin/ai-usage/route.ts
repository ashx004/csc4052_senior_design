import { NextRequest } from "next/server";
import { adminEndpoint } from "@/src/library/adminEndpoint";
import { ReportError } from "@/src/library/analyticsReportContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return adminEndpoint(request, "admin-ai-usage", async () => {
    const params = request.nextUrl.searchParams;
    for (const key of params.keys()) {
      if (key !== "days") throw new ReportError(400, "Unsupported query parameter.");
    }
    const raw = params.get("days") ?? "7";
    const days = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      throw new ReportError(400, "days must be a whole number from 1 to 31.");
    }
    const { getAiPerformanceReport } = await import("@/src/library/billing/aiUsageReports");
    return getAiPerformanceReport(days);
  });
}
