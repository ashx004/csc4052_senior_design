import { NextRequest } from "next/server";
import { adminEndpoint } from "@/src/library/adminEndpoint";
import { ReportError } from "@/src/library/analyticsReportContract";
import { isKnownFeature } from "@/src/library/billing/aiFeatures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return adminEndpoint(request, "admin-ai-usage", async () => {
    const params = request.nextUrl.searchParams;
    for (const key of params.keys()) {
      if (key !== "days" && key !== "feature") throw new ReportError(400, "Unsupported query parameter.");
    }
    const raw = params.get("days") ?? "7";
    const days = /^\d+$/.test(raw) ? Number(raw) : NaN;
    if (!Number.isInteger(days) || days < 1 || days > 31) {
      throw new ReportError(400, "days must be a whole number from 1 to 31.");
    }
    const feature = params.get("feature");
    if (feature !== null && !isKnownFeature(feature)) {
      throw new ReportError(400, "Unknown AI feature.");
    }
    const { getAdminAiReport } = await import("@/src/library/billing/aiUsageReports");
    return feature === null ? getAdminAiReport(days) : getAdminAiReport(days, feature);
  });
}
