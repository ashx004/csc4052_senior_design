"use client";
import type { AdminAiReport } from "@/src/library/billing/aiUsageReports";
import { useAdminReport } from "@/src/hooks/useAdminReport";

/** The one client fetch of the admin AI report, shared by the AI pages. `error` is the server's own message. */
export function useAiReport(days: number, feature?: string) {
  const params = new URLSearchParams({ days: String(days) });
  if (feature) params.set("feature", feature);
  const { data, error, loading } = useAdminReport<AdminAiReport>(`/api/admin/ai-usage?${params}`, 0);
  return { report: data, error: error || null, loading };
}
