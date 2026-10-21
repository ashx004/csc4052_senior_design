import { NextRequest } from "next/server";
import { adminEndpoint } from "@/src/library/adminEndpoint";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: NextRequest) {
  return adminEndpoint(request, "admin-health", async () => {
    const { getHealthReport } = await import("@/src/library/monitoring/health");
    return getHealthReport();
  });
}
