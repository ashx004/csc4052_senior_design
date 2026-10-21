import { NextRequest } from "next/server";
import { adminEndpoint } from "@/src/library/adminEndpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return adminEndpoint(request, "analytics-realtime", async () => {
    const { getRealtimeReport } = await import(
      "@/src/library/analyticsReports"
    );
    return getRealtimeReport();
  });
}
