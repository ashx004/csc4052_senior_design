import { getHealthReport } from "@/src/library/monitoring/healthChecks";

// Public health check for the uptime monitor: 200 when the database, storage
// and AI boxes all answer, 503 when any of them doesn't. See healthChecks.ts
// and docs/INCIDENT_RESPONSE.md.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEADERS = { "Cache-Control": "no-store" };

export async function GET() {
  const report = await getHealthReport();
  return Response.json(report, { status: report.status === "ok" ? 200 : 503, headers: HEADERS });
}

// Some uptime monitors send HEAD by default.
export async function HEAD() {
  const report = await getHealthReport();
  return new Response(null, { status: report.status === "ok" ? 200 : 503, headers: HEADERS });
}
